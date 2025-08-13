const logger = require("../logger");
const utils = require("../utils");
const states = require("../states");
const services = {
    knowledgeBase: require("../services/knowledgeBase"),
    adminAnswers: require("../services/adminAnswers")
};
const keyboards = require("../keyboards/mainMenu");
const adminPanelKeyboards = require("../keyboards/adminPanel");

const targetChatId = "-1002826990012"; // Глобальная переменная для чата админов

let isHandlersRegistered = false;

module.exports = function setupMessageHandlers(bot, userStates) {
    if (isHandlersRegistered) {
        logger.info("Обработчики сообщений уже зарегистрированы, пропускаем...");
        return;
    }
    isHandlersRegistered = true;

    bot.on("message", async (msg) => {
        logger.info(`Получено сообщение от ${msg.from.id}: ${msg.text}, состояние: ${userStates.get(msg.from.id)} в ${new Date().toISOString()}`);
        if (!msg.text || msg.text.startsWith("/") || msg.text.match(/меню|menu/i)) {
            return;
        }

        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const username = msg.from.username || "Unknown";
        const messageText = msg.text.trim();

        if (!messageText) return;

        const userState = userStates.get(userId) || states.MAIN_MENU;

        // Обработка ответа администратора с ключевыми словами
        if (userState === states.ADMIN_ANSWERING && (await utils.isAdmin(bot, userId))) {
            const answerData = userStates.get(`${userId}_answer_data`);
            if (answerData) {
                const keywords = messageText
                    .split(",")
                    .map((k) => k.trim())
                    .filter((k) => k);

                if (keywords.length > 0) {
                    try {
                        const targetUserId = answerData.targetUserId.toString();
                        await services.adminAnswers.updateAdminAnswer(
                            targetUserId,
                            answerData.answer,
                            keywords
                        );
                        userStates.delete(`${userId}_answer_data`);
                        userStates.set(userId, states.ADMIN_ANSWERING);

                        await utils.safeSendMessage(
                            bot,
                            targetChatId,
                            `✅ Ответ сохранен в базе знаний с ключевыми словами: ${keywords.join(", ")}`,
                            {
                                parse_mode: "Markdown",
                                message_thread_id: 102,
                                reply_markup: { inline_keyboard: adminPanelKeyboards.getAdminPanelKeyboard() }
                            }
                        );
                    } catch (error) {
                        logger.error("Ошибка при сохранении ответа:", { error });
                        await utils.safeSendMessage(
                            bot,
                            targetChatId,
                            "❌ Произошла ошибка при сохранении. Попробуйте ещё раз.",
                            {
                                parse_mode: "Markdown",
                                message_thread_id: 102,
                                reply_markup: { inline_keyboard: adminPanelKeyboards.getAdminPanelKeyboard() }
                            }
                        );
                    }
                } else {
                    await utils.safeSendMessage(
                        bot,
                        targetChatId,
                        "❌ Укажите хотя бы одно ключевое слово",
                        {
                            parse_mode: "Markdown",
                            message_thread_id: 102,
                            reply_markup: { inline_keyboard: adminPanelKeyboards.getAdminPanelKeyboard() }
                        }
                    );
                }
            }
            return;
        }

        // Обработка ответа администратора через кнопку
        if (userState === states.ADMIN_ANSWERING_BUTTON && (await utils.isAdmin(bot, userId))) {
            const targetUserId = userStates.get(`${userId}_target_user`);
            if (targetUserId) {
                try {
                    const cleanAnswer = messageText.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "");
                    const userChatId = typeof targetUserId === "string" ? parseInt(targetUserId) : targetUserId;

                    await utils.safeSendMessage(
                        bot,
                        userChatId,
                        `💬 Ответ от менеджера:\n\n${cleanAnswer}`,
                        {
                            parse_mode: "Markdown",
                            ...keyboards.getBackToMenuKeyboard()
                        }
                    );

                    await services.adminAnswers.deleteQuestion(targetUserId);

                    userStates.delete(`${userId}_target_user`);
                    userStates.set(userId, states.ADMIN_ANSWERING);
                    userStates.set(`${userId}_answer_data`, {
                        targetUserId,
                        answer: cleanAnswer
                    });

                    await utils.safeSendMessage(
                        bot,
                        targetChatId,
                        `✅ Ответ отправлен пользователю.\n\n🔤 Укажите ключевые слова через запятую (для поиска похожих вопросов)\n\n💡 Или напишите "авто" для автоматической генерации ключевых слов с помощью AI`,
                        {
                            parse_mode: "Markdown",
                            message_thread_id: 102
                        }
                    );
                } catch (error) {
                    logger.error("Ошибка при отправке ответа:", { error });
                    await utils.safeSendMessage(
                        bot,
                        targetChatId,
                        `❌ Ошибка при отправке ответа: ${error.message}`,
                        {
                            parse_mode: "Markdown",
                            message_thread_id: 102,
                            reply_markup: { inline_keyboard: adminPanelKeyboards.getAdminPanelKeyboard() }
                        }
                    );
                    userStates.delete(`${userId}_target_user`);
                    userStates.set(userId, states.ADMIN_ANSWERING);
                }
            }
            return;
        }

        // Если пользователь — администратор, игнорируем сообщения, если не в нужном состоянии
        if (await utils.isAdmin(bot, userId)) {
            await utils.safeSendMessage(
                bot,
                chatId,
                "Пожалуйста, выберите действие из меню админа.",
                {
                    parse_mode: "Markdown",
                    reply_markup: { inline_keyboard: adminPanelKeyboards.getAdminPanelKeyboard() }
                }
            );
            return;
        }

        // Обработка сообщений только в состоянии ASKING_QUESTIONS
        if (userState === states.ASKING_QUESTIONS) {
            const pendingQuestions = services.adminAnswers.getPendingQuestions();
            const hasPendingQuestion = pendingQuestions.has(userId.toString());

            const autoAnswer = services.knowledgeBase.findAnswerInKnowledgeBase(messageText);

            if (autoAnswer) {
                if (hasPendingQuestion) {
                    pendingQuestions.delete(userId.toString());
                    logger.info(`Удалён ожидающий вопрос для пользователя ${userId}`);
                }
                await utils.safeSendMessage(bot, chatId, autoAnswer, {
                    parse_mode: "Markdown",
                    ...keyboards.getBackToMenuKeyboard()
                });
            } else {
                if (!hasPendingQuestion) {
                    await services.adminAnswers.saveUnknownQuestion(userId, username, messageText);
                    await utils.forwardToAdmins(bot, userId, username, messageText);
                    await utils.safeSendMessage(
                        bot,
                        chatId,
                        `Спасибо за ваш вопрос! 🤔\n\nЯ передам его нашему менеджеру, и он ответит вам в ближайшее время.\n\nА пока вы можете воспользоваться меню с готовыми ответами 👇`,
                        {
                            parse_mode: "Markdown",
                            ...keyboards.getBackToMenuKeyboard()
                        }
                    );
                    logger.info(`Вопрос от пользователя ${userId} сохранён и передан администраторам: ${messageText}`);
                } else {
                    await utils.safeSendMessage(
                        bot,
                        chatId,
                        `Ваш предыдущий вопрос ещё обрабатывается.\n\nПожалуйста, дождитесь ответа от менеджера или воспользуйтесь меню с готовыми ответами 👇`,
                        {
                            parse_mode: "Markdown",
                            ...keyboards.getMainMenuKeyboard()
                        }
                    );
                    logger.info(`Пользователь ${userId} попытался отправить новый вопрос, но предыдущий ещё в обработке`);
                }
            }
        } else if (userState !== states.BOOKING_PROCESS) {
            await utils.safeSendMessage(
                bot,
                chatId,
                `Пожалуйста, выберите опцию из меню 👇`,
                {
                    parse_mode: "Markdown",
                    ...keyboards.getMainMenuKeyboard()
                }
            );
            logger.info(`Сообщение от пользователя ${userId} в состоянии ${userState} проигнорировано: ${messageText}`);
        }
    });
};
