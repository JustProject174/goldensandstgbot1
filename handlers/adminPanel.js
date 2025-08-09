const logger = require("../logger");
const keyboards = require("../keyboards/adminPanel");
const mainKeyboards = require("../keyboards/mainMenu");
const utils = require("../utils");
const states = require("../states");
const services = {
    knowledgeBase: require("../services/knowledgeBase"),
    roomsData: require("../services/roomsData"),
    adminAnswers: require("../services/adminAnswers"),
};

const targetChatId = "-1002826990012"; // Чат админов
const threadId = 102; // ID темы в форуме (если используется)

// Функция экранирования Markdown
function escapeMarkdown(text) {
    return String(text).replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

module.exports = function setupAdminHandlers(bot, userStates) {
    // Команда /answer
    bot.onText(/\/answer (\d+) (.+)/, async (msg, match) => {
        const userId = msg.from.id;
        if (!(await utils.isAdmin(bot, userId))) return;

        const targetUserId = parseInt(match[1]);
        let answer = escapeMarkdown(match[2]);

        // Проверяем, есть ли вопрос у этого пользователя
        const pendingQuestions = services.adminAnswers.getPendingQuestions();
        if (!pendingQuestions.has(targetUserId.toString())) {
            return utils.safeSendMessage(
                bot,
                targetChatId,
                `⚠️ Пользователь с ID ${targetUserId} не найден в очереди.`,
                { parse_mode: "Markdown", message_thread_id: threadId }
            );
        }

        try {
            await utils.safeSendMessage(
                bot,
                targetUserId,
                `💬 Ответ от менеджера:\n\n${answer}`,
                { parse_mode: "Markdown", ...mainKeyboards.getBackToMenuKeyboard() }
            );

            // Удаляем вопрос единым способом
            await services.adminAnswers.removeQuestion(targetUserId);

            userStates.set(userId, states.ADMIN_ANSWERING);
            userStates.set(`${userId}_answer_data`, { targetUserId, answer });

            await utils.safeSendMessage(
                bot,
                targetChatId,
                `✅ Ответ отправлен пользователю.\n\n🔤 Укажите ключевые слова через запятую для добавления в базу знаний в Supabase:\n\n_Например: бронирование, резерв, забронировать_\n\n💡 Или напишите "авто" для автоматической генерации ключевых слов с помощью AI`,
                { parse_mode: "Markdown", message_thread_id: threadId, ...keyboards.getBackToAdminKeyboard() }
            );
        } catch (error) {
            await utils.safeSendMessage(
                bot,
                targetChatId,
                `❌ Ошибка при отправке ответа: ${escapeMarkdown(error.message)}`,
                { parse_mode: "Markdown", message_thread_id: threadId }
            );
        }
    });

    // Обработка callback_query
    bot.on("callback_query", async (callbackQuery) => {
        const data = callbackQuery.data;
        const userId = callbackQuery.from.id;
        if (!(await utils.isAdmin(bot, userId))) return;

        // Отвечаем на callback один раз
        await bot.answerCallbackQuery(callbackQuery.id).catch(console.error);

        try {
            switch (data) {
                case "admin_panel":
                    userStates.set(userId, states.ADMIN_PANEL);
                    return utils.safeSendMessage(
                        bot,
                        targetChatId,
                        "⚙️ Панель администратора",
                        { parse_mode: "Markdown", message_thread_id: threadId, ...keyboards.getAdminKeyboard() }
                    );

                case "admin_stats":
                    return handleAdminStats();

                case "admin_kb":
                    return handleAdminKnowledgeBase();

                case "admin_pending":
                    return handleAdminPending();

                case "admin_reload":
                    return handleAdminReload();
            }

            if (data.startsWith("view_question_")) {
                return handleViewQuestion(data.replace("view_question_", ""));
            }

            if (data.startsWith("answer_btn_")) {
                const targetUserId = data.replace("answer_btn_", "");
                const pending = services.adminAnswers.getPendingQuestions().get(targetUserId);

                if (!pending) {
                    return utils.safeSendMessage(
                        bot,
                        targetChatId,
                        "⚠️ Вопрос уже удалён или не найден.",
                        { parse_mode: "Markdown", message_thread_id: threadId, ...keyboards.getBackToAdminKeyboard() }
                    );
                }

                userStates.set(userId, states.ADMIN_ANSWERING_BUTTON);
                userStates.set(`${userId}_target_user`, targetUserId);

                return utils.safeSendMessage(
                    bot,
                    targetChatId,
                    `📝 Напишите ответ на вопрос:\n\n"${escapeMarkdown(pending.question)}"`,
                    { parse_mode: "Markdown", message_thread_id: threadId }
                );
            }

            if (data.startsWith("reject_btn_")) {
                return handleRejectQuestion(data.replace("reject_btn_", ""));
            }
        } catch (error) {
            console.error("Ошибка в admin callback:", error.message);
            return utils.safeSendMessage(
                bot,
                targetChatId,
                `❌ Произошла ошибка: ${escapeMarkdown(error.message)}`,
                { parse_mode: "Markdown", message_thread_id: threadId }
            );
        }
    });

    // Функции-обработчики
    async function handleAdminStats() {
        const stats = `📊 Статистика бота:\n
👥 Активных пользователей в сессии: ${userStates.size}
❓ Вопросов в очереди: ${services.adminAnswers.getPendingQuestions().size}
📚 Записей в базе знаний: ${services.knowledgeBase.getKnowledgeBase().length}
🏠 Номеров в базе данных: ${services.roomsData.getRoomsData().length}`;

        return utils.safeSendMessage(bot, targetChatId, escapeMarkdown(stats), {
            parse_mode: "Markdown",
            message_thread_id: threadId,
            ...keyboards.getBackToAdminKeyboard(),
        });
    }

    async function handleAdminKnowledgeBase() {
        const knowledgeBase = services.knowledgeBase.getKnowledgeBase().length;

        if (knowledgeBase.length === 0) {
            return utils.safeSendMessage(bot, targetChatId, "📚 База знаний пуста", {
                parse_mode: "Markdown",
                message_thread_id: threadId,
                ...keyboards.getBackToAdminKeyboard(),
            });
        }

        let kbInfo = "📚 База знаний:\n\n";
        const messages = [];

        knowledgeBase.forEach((item, index) => {
            kbInfo += `${index + 1}. Ключевые слова: ${escapeMarkdown(item.keywords.join(", "))}\n`;
            kbInfo += `   Ответ: ${escapeMarkdown(item.answer.substring(0, 100))}${item.answer.length > 100 ? "..." : ""}\n\n`;

            // Если длина текста близка к лимиту Telegram (4096), отправляем как отдельное сообщение
            if (kbInfo.length > 3500) {
                messages.push(kbInfo);
                kbInfo = "";
            }
        });

        if (kbInfo.trim()) messages.push(kbInfo);

        // Отправляем куски по очереди
        for (const msgText of messages) {
            await utils.safeSendMessage(bot, targetChatId, msgText, {
                parse_mode: "Markdown",
                message_thread_id: threadId,
            });
        }

        // В конце добавляем клавиатуру для возврата
        await utils.safeSendMessage(bot, targetChatId, "⬅️ Назад", {
            parse_mode: "Markdown",
            message_thread_id: threadId,
            ...keyboards.getBackToAdminKeyboard(),
        });
    }

    async function handleAdminPending() {
        const pendingQuestions = services.adminAnswers.getPendingQuestions();

        if (pendingQuestions.size === 0) {
            return utils.safeSendMessage(
                bot,
                targetChatId,
                "❓ Нет неотвеченных вопросов",
                { parse_mode: "Markdown", message_thread_id: threadId, ...keyboards.getBackToAdminKeyboard() }
            );
        }

        return utils.safeSendMessage(
            bot,
            targetChatId,
            "❓ Выберите вопрос для ответа:",
            { parse_mode: "Markdown", message_thread_id: threadId, ...keyboards.getPendingQuestionsListKeyboard(pendingQuestions) }
        );
    }

    async function handleViewQuestion(userId) {
        const questionData = services.adminAnswers.getPendingQuestions().get(userId);

        if (!questionData) {
            return utils.safeSendMessage(
                bot,
                targetChatId,
                "❌ Вопрос не найден",
                { parse_mode: "Markdown", message_thread_id: threadId, ...keyboards.getBackToAdminKeyboard() }
            );
        }

        const timestamp = new Date(questionData.timestamp).toLocaleString("ru-RU");
        const questionInfo = `📋 НОВЫЙ ВОПРОС\n
👤 Пользователь: ID ${userId}
📅 Время получения: ${timestamp}\n
❓ Текст вопроса:
${escapeMarkdown(questionData.question)}\n
🔽 Выберите действие:`;

        return utils.safeSendMessage(bot, targetChatId, questionInfo, {
            parse_mode: "Markdown",
            message_thread_id: threadId,
            ...keyboards.getQuestionManagementKeyboard(userId),
        });
    }

    async function handleRejectQuestion(targetUserId) {
        try {
            const rejectionMessage = "Ваш вопрос некорректен, сформулируйте пожалуйста снова";

            await utils.safeSendMessage(bot, parseInt(targetUserId), rejectionMessage, {
                parse_mode: "Markdown",
                ...mainKeyboards.getBackToMenuKeyboard(),
            });

            await services.adminAnswers.removeQuestion(targetUserId);

            return utils.safeSendMessage(
                bot,
                targetChatId,
                "✅ Вопрос отклонен и удален из очереди",
                { parse_mode: "Markdown", message_thread_id: threadId, ...keyboards.getBackToAdminKeyboard() }
            );
        } catch (error) {
            console.error("Ошибка при отклонении вопроса:", error);
            return utils.safeSendMessage(
                bot,
                targetChatId,
                `❌ Ошибка при отклонении вопроса: ${escapeMarkdown(error.message)}`,
                { parse_mode: "Markdown", message_thread_id: threadId, ...keyboards.getBackToAdminKeyboard() }
            );
        }
    }

    async function handleAdminReload() {
        try {
            await services.knowledgeBase.loadKnowledgeBase();
            await services.adminAnswers.loadAndProcessAdminAnswers();
            await services.roomsData.loadRoomsData();

            return utils.safeSendMessage(
                bot,
                targetChatId,
                `✅ База данных обновлена:\n\n📚 Записей в базе знаний: ${services.knowledgeBase.getKnowledgeBase().length}\n🏠 Номеров загружено: ${services.roomsData.getRoomsData().length}`,
                { parse_mode: "Markdown", message_thread_id: threadId, ...keyboards.getBackToAdminKeyboard() }
            );
        } catch (error) {
            console.error("Ошибка при обновлении базы:", error);
            return utils.safeSendMessage(
                bot,
                targetChatId,
                `❌ Ошибка обновления: ${escapeMarkdown(error.message)}`,
                { parse_mode: "Markdown", message_thread_id: threadId, ...keyboards.getBackToAdminKeyboard() }
            );
        }
    }
};
