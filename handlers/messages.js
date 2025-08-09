const states = require("../states");
const utils = require("../utils");
const services = {
    knowledgeBase: require("../services/knowledgeBase"),
    roomsData: require("../services/roomsData"),
    adminAnswers: require("../services/adminAnswers"),
};
const keyboards = require("../keyboards/mainMenu");

const targetChatId = "-1002826990012"; // Глобальная переменная для чата админов

module.exports = function setupMessageHandlers(bot, userStates) {
    bot.on("message", async (msg) => {
        if (
            !msg.text ||
            msg.text.startsWith("/") ||
            msg.text.match(/меню|menu/i)
        ) {
            return;
        }

        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const username = msg.from.username;
        const messageText = msg.text.trim();

        if (!messageText) return;

        const userState = userStates.get(userId) || states.MAIN_MENU;

        // Обработка ответа администратора с ключевыми словами
        if (
            userState === states.ADMIN_ANSWERING &&
            (await utils.isAdmin(bot, userId))
        ) {
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
                            keywords,
                        );
                        userStates.delete(`${userId}_answer_data`);
                        userStates.set(userId, states.MAIN_MENU);

                        await utils.safeSendMessage(
                            bot,
                            targetChatId,
                            `✅ Ответ сохранен и будет добавлен в базе знаний с ключевыми словами: ${keywords.join(", ")}`,
                            {
                                parse_mode: "Markdown",
                                message_thread_id: 102,
                            },
                        );
                    } catch (error) {
                        console.error("Ошибка при сохранении ответа:", error);
                        await utils.safeSendMessage(
                            bot,
                            targetChatId,
                            "❌ Произошла ошибка при сохранении. Попробуйте ещё раз.",
                            {
                                parse_mode: "Markdown",
                                message_thread_id: 102,
                            },
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
                        },
                    );
                }
            }
            return;
        }

        // Обработка ответа администратора через кнопку
        if (userState === states.ADMIN_ANSWERING_BUTTON) {
            const targetUserId = userStates.get(`${userId}_target_user`);
            if (targetUserId) {
                try {
                    const cleanAnswer = messageText.replace(
                        /[_*[\]()~`>#+\-=|{}.!\\]/g,
                        "",
                    );
                    const userChatId =
                        typeof targetUserId === "string"
                            ? parseInt(targetUserId)
                            : targetUserId;

                    await utils.safeSendMessage(
                        bot,
                        userChatId,
                        `💬 Ответ от менеджера:\n\n${cleanAnswer}`,
                        {
                            parse_mode: "Markdown",
                            ...keyboards.getBackToMenuKeyboard(),
                        },
                    );

                    services.adminAnswers
                        .getPendingQuestions()
                        .delete(targetUserId);

                    userStates.delete(`${userId}_target_user`);
                    userStates.set(userId, states.MAIN_MENU);

                    userStates.set(userId, states.ADMIN_ANSWERING);
                    userStates.set(`${userId}_answer_data`, {
                        targetUserId,
                        answer: cleanAnswer,
                    });

                    await utils.safeSendMessage(
                        bot,
                        targetChatId,
                        `✅ Ответ отправлен пользователю.\n\n🔤 Укажите ключевые слова через запятую (для поиска похожих вопросов)\n\n💡 Или напишите "авто" для автоматической генерации ключевых слов с помощью AI`,
                        {
                            parse_mode: "Markdown",
                            message_thread_id: 102,
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
                    userStates.delete(`${userId}_target_user`);
                    userStates.set(userId, states.MAIN_MENU);
                }
            }
            return;
        }

        // Если администратор не в состоянии ADMIN_ANSWERING или ADMIN_ANSWERING_BUTTON
        if (await utils.isAdmin(bot, userId)) {
            return;
        }

        // Обработка сообщений только в состоянии ASKING_QUESTIONS
        if (userState === states.ASKING_QUESTIONS) {
            // Проверяем, есть ли уже ожидающий вопрос от этого пользователя
            const pendingQuestions = services.adminAnswers.getPendingQuestions();
            const hasPendingQuestion = pendingQuestions.has(userId.toString());

            // Поиск в базе знаний
            const autoAnswer =
                services.knowledgeBase.findAnswerInKnowledgeBase(messageText);

            if (autoAnswer) {
                if (hasPendingQuestion) {
                    pendingQuestions.delete(userId.toString());
                }
                await utils.safeSendMessage(bot, chatId, autoAnswer, {
                    parse_mode: "Markdown",
                    ...keyboards.getBackToMenuKeyboard(),
                });
            } else {
                if (!hasPendingQuestion) {
                    await services.adminAnswers.saveUnknownQuestion(
                        userId,
                        username,
                        messageText,
                    );

                    await utils.safeSendMessage(
                        bot,
                        chatId,
                        `Спасибо за ваш вопрос! 🤔

Я передам его нашему менеджеру, и он ответит вам в ближайшее время.

А пока вы можете воспользоваться меню с готовыми ответами 👇`,
                    keyboards.getBackToMenuKeyboard(),
                    );

                    await utils.forwardToAdmins(bot, userId, username, messageText);
                } else {
                    await utils.safeSendMessage(
                        bot,
                        chatId,
                        `Ваш предыдущий вопрос еще обрабатывается. 

Пожалуйста, дождитесь ответа от менеджера или воспользуйтесь меню с готовыми ответами 👇`,
                        keyboards.getMainMenuKeyboard(),
                    );
                }
            }
        } else if (userState !== states.BOOKING_PROCESS) {
            // Если пользователь не в состоянии ASKING_QUESTIONS и не в BOOKING_PROCESS
            await utils.safeSendMessage(
                bot,
                chatId,
                `Пожалуйста, выберите опцию из меню 👇`,
                keyboards.getMainMenuKeyboard(),
            );
        }
    });
};