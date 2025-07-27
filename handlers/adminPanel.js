const keyboards = require("../keyboards/adminPanel");
const mainKeyboards = require("../keyboards/mainMenu");
const utils = require("../utils");
const states = require("../states");
const services = {
    knowledgeBase: require("../services/knowledgeBase"),
    roomsData: require("../services/roomsData"),
    adminAnswers: require("../services/adminAnswers"),
};

const targetChatId = "-1002826990012"; // Глобальная переменная для чата админов

module.exports = function setupAdminHandlers(bot, userStates) {
    // Обработка команды /answer
    bot.onText(/\/answer (\d+) (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        if (!(await utils.isAdmin(bot, userId))) return;

        const targetUserId = parseInt(match[1]);
        let answer = match[2];

        // Очищаем ответ от потенциально проблематичных символов
        answer = answer.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "");

        try {
            await utils.safeSendMessage(
                bot,
                targetUserId, // Отправка пользователю
                `💬 Ответ от менеджера:\n\n${answer}`,
                {
                    parse_mode: "Markdown",
                    ...mainKeyboards.getBackToMenuKeyboard(),
                },
            );

            // Удаляем вопрос из списка ожидающих
            services.adminAnswers.getPendingQuestions().delete(targetUserId.toString());

            userStates.set(userId, states.ADMIN_ANSWERING);
            userStates.set(`${userId}_answer_data`, { targetUserId, answer });

            await utils.safeSendMessage(
                bot,
                targetChatId,
                `✅ Ответ отправлен пользователю.\n\n🔤 Укажите ключевые слова через запятую для добавления в базу знаний в Supabase:\n\n_Например: бронирование, резерв, забронировать_\n\n💡 Или напишите "авто" для автоматической генерации ключевых слов с помощью AI`,
                {
                    parse_mode: "Markdown",
                    message_thread_id: 102,
                    ...keyboards.getBackToAdminKeyboard(),
                },
            );
        } catch (error) {
            await utils.safeSendMessage(
                bot,
                targetChatId,
                `❌ Ошибка при отправке ответа: ${error.message}`,
                {
                    parse_mode: "Markdown",
                    message_thread_id: 102,
                },
            );
        }
    });

    // Обработка callback запросов админ-панели
    bot.on("callback_query", async (callbackQuery) => {
        const msg = callbackQuery.message;
        const chatId = msg.chat.id;
        const userId = callbackQuery.from.id;
        const data = callbackQuery.data;

        if (!(await utils.isAdmin(bot, userId))) return;

        try {
            try {
                await bot.answerCallbackQuery(callbackQuery.id);
            } catch (error) {
                console.error(
                    "Ошибка при ответе на callback query:",
                    error.message,
                );
            }

            switch (data) {
                case "admin_panel":
                    userStates.set(userId, states.ADMIN_PANEL);
                    await utils.safeSendMessage(
                        bot,
                        targetChatId,
                        "⚙️ Панель администратора",
                        {
                            parse_mode: "Markdown",
                            message_thread_id: 102,
                            ...keyboards.getAdminKeyboard(),
                        },
                    );
                    break;

                case "admin_stats":
                    await handleAdminStats(bot, chatId);
                    break;

                case "admin_kb":
                    await handleAdminKnowledgeBase(bot, chatId);
                    break;

                case "admin_pending":
                    await handleAdminPending(bot, chatId);
                    break;

                case "admin_reload":
                    await handleAdminReload(bot, chatId);
                    break;
            }

            // Обработка просмотра конкретного вопроса
            if (data.startsWith("view_question_")) {
                const targetUserId = data.replace("view_question_", "");
                await handleViewQuestion(bot, chatId, targetUserId);
            }

            // Обработка ответа на вопрос через кнопку
            if (data.startsWith("answer_btn_")) {
                const targetUserId = data.replace("answer_btn_", "");
                userStates.set(userId, states.ADMIN_ANSWERING_BUTTON);
                userStates.set(`${userId}_target_user`, targetUserId);

                const questionData = services.adminAnswers
                    .getPendingQuestions()
                    .get(targetUserId);
                const questionText = questionData
                    ? questionData.question
                    : "Вопрос не найден";

                await utils.safeSendMessage(
                    bot,
                    targetChatId,
                    `📝 Напишите ответ на вопрос:\n\n"${questionText}"`,
                    {
                        parse_mode: "Markdown",
                        message_thread_id: 102,
                    },
                );
            }

            // Обработка отклонения вопроса через кнопку
            if (data.startsWith("reject_btn_")) {
                const targetUserId = data.replace("reject_btn_", "");
                await handleRejectQuestion(bot, chatId, targetUserId);
            }
        } catch (error) {
            console.error(
                "Ошибка в admin callback query обработчике:",
                error.message,
            );
            try {
                await bot.answerCallbackQuery(callbackQuery.id);
            } catch (answerError) {
                console.error(
                    "Не удалось ответить на admin callback query:",
                    answerError.message,
                );
            }
        }
    });

    async function handleAdminStats(bot, chatId) {
        const stats = `📊 Статистика бота:

    👥 Активных пользователей в сессии: ${userStates.size}
    ❓ Вопросов в очереди: ${services.adminAnswers.getPendingQuestions().size}
    📚 Записей в базе знаний: ${await services.knowledgeBase.getKnowledgeBaseLength()}
    🏠 Номеров в базе данных: ${services.roomsData.getRoomsData().length}`;

        await utils.safeSendMessage(bot, targetChatId, stats, {
            parse_mode: "Markdown",
            message_thread_id: 102,
            ...keyboards.getBackToAdminKeyboard(),
        });
    }

    async function handleAdminKnowledgeBase(bot, chatId) {
        let kbInfo = "📚 База знаний:\n\n";
        const knowledgeBase = await services.knowledgeBase.getKnowledgeBase();

        if (knowledgeBase.length === 0) {
            kbInfo += "База знаний пуста";
        } else {
            knowledgeBase.forEach((item, index) => {
                kbInfo += `${index + 1}. Ключевые слова: ${item.keywords.join(", ")}\n`;
                kbInfo += `   Ответ: ${item.answer.substring(0, 100)}${item.answer.length > 100 ? "..." : ""}\n\n`;
            });
        }

        await utils.safeSendMessage(bot, targetChatId, kbInfo, {
            parse_mode: "Markdown",
            message_thread_id: 102,
            ...keyboards.getBackToAdminKeyboard(),
        });
    }

    async function handleAdminPending(bot, chatId) {
        const pendingQuestions = services.adminAnswers.getPendingQuestions();

        if (pendingQuestions.size === 0) {
            await utils.safeSendMessage(
                bot,
                targetChatId,
                "❓ Нет неотвеченных вопросов",
                {
                    parse_mode: "Markdown",
                    message_thread_id: 102,
                    ...keyboards.getBackToAdminKeyboard(),
                },
            );
        } else {
            await utils.safeSendMessage(
                bot,
                targetChatId,
                "❓ Выберите вопрос для ответа:",
                {
                    parse_mode: "Markdown",
                    message_thread_id: 102,
                    ...keyboards.getPendingQuestionsListKeyboard(
                        pendingQuestions,
                    ),
                },
            );
        }
    }

    async function handleViewQuestion(bot, chatId, userId) {
        const pendingQuestions = services.adminAnswers.getPendingQuestions();
        const questionData = pendingQuestions.get(userId);

        if (!questionData) {
            await utils.safeSendMessage(
                bot,
                targetChatId,
                "❌ Вопрос не найден",
                {
                    parse_mode: "Markdown",
                    message_thread_id: 102,
                    ...keyboards.getBackToAdminKeyboard(),
                },
            );
            return;
        }

        const timestamp = new Date(questionData.timestamp).toLocaleString(
            "ru-RU",
        );
        const questionInfo = `📋 **НОВЫЙ ВОПРОС**

    👤 **Пользователь:** ID ${userId}
    📅 **Время получения:** ${timestamp}

    ❓ **Текст вопроса:**
    ${questionData.question}

    🔽 **Выберите действие:`;

        await utils.safeSendMessage(bot, targetChatId, questionInfo, {
            parse_mode: "Markdown",
            message_thread_id: 102,
            ...keyboards.getQuestionManagementKeyboard(userId),
        });
    }

    async function handleRejectQuestion(bot, chatId, targetUserId) {
        try {
            const rejectionMessage =
                "Ваш вопрос некорректен, сформулируйте пожалуйста снова";

            const userChatId =
                typeof targetUserId === "string"
                    ? parseInt(targetUserId)
                    : targetUserId;

            await utils.safeSendMessage(bot, userChatId, rejectionMessage, {
                parse_mode: "Markdown",
                ...mainKeyboards.getBackToMenuKeyboard(),
            });

            // Удаляем из очереди в Supabase
            await services.adminAnswers.removeQuestion(targetUserId);

            await utils.safeSendMessage(
                bot,
                targetChatId,
                `✅ Вопрос отклонен и удален из очереди`,
                {
                    parse_mode: "Markdown",
                    message_thread_id: 102,
                    ...keyboards.getBackToAdminKeyboard(),
                },
            );
        } catch (error) {
            console.error("Ошибка при отклонении вопроса:", error);
            await utils.safeSendMessage(
                bot,
                targetChatId,
                `❌ Ошибка при отклонении вопроса: ${error.message}`,
                {
                    parse_mode: "Markdown",
                    message_thread_id: 102,
                    ...keyboards.getBackToAdminKeyboard(),
                },
            );
        }
    }

    async function handleAdminReload(bot, chatId) {
        try {
            await services.knowledgeBase.loadKnowledgeBase();
            await services.adminAnswers.loadAndProcessAdminAnswers();
            await services.roomsData.loadRoomsData();

            await utils.safeSendMessage(
                bot,
                targetChatId,
                `✅ База данных обновлена:\n\n📚 Записей в базе знаний: ${await services.knowledgeBase.getKnowledgeBaseLength()}\n🏠 Номеров загружено: ${services.roomsData.getRoomsData().length}`,
                {
                    parse_mode: "Markdown",
                    message_thread_id: 102,
                    ...keyboards.getBackToAdminKeyboard(),
                },
            );
        } catch (error) {
            console.error("Ошибка при обновлении базы данных:", error);
            await utils.safeSendMessage(
                bot,
                targetChatId,
                `❌ Ошибка обновления: ${error.message}`,
                {
                    parse_mode: "Markdown",
                    message_thread_id: 102,
                    ...keyboards.getBackToAdminKeyboard(),
                },
            );
        }
    }
};