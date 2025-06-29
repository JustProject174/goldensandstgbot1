const keyboards = require('../keyboards/adminPanel');
const mainKeyboards = require('../keyboards/mainMenu');
const utils = require('../utils');
const states = require('../states');
const services = {
    knowledgeBase: require('../services/knowledgeBase'),
    roomsData: require('../services/roomsData'),
    adminAnswers: require('../services/adminAnswers')
};

module.exports = function setupAdminHandlers(bot, userStates) {
    // Обработка команды /answer
    bot.onText(/\/answer (\d+) (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        if (!utils.isAdmin(userId)) return;

        const targetUserId = parseInt(match[1]);
        let answer = match[2];

        // Очищаем ответ от потенциально проблематичных символов
        answer = answer.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '');

        try {
            await utils.safeSendMessage(bot, targetUserId, `💬 Ответ от менеджера:\n\n${answer}`, {
                parse_mode: 'Markdown',
                ...mainKeyboards.getBackToMenuKeyboard() // Используем mainKeyboards
            });

            services.adminAnswers.getPendingQuestions().delete(targetUserId.toString());

            userStates.set(userId, states.ADMIN_ANSWERING);
            userStates.set(`${userId}_answer_data`, { targetUserId, answer });

            await utils.safeSendMessage(bot, chatId, `✅ Ответ отправлен пользователю.\n\nТеперь укажите ключевые слова через запятую для добавления в базу знаний:\n\n_Например: бронирование, резерв, забронировать_`, {
                parse_mode: 'Markdown'
            });

        } catch (error) {
            await utils.safeSendMessage(bot, chatId, `❌ Ошибка при отправке ответа: ${error.message}`);
        }
    });

    // Обработка callback запросов админ-панели
    bot.on('callback_query', async (callbackQuery) => {
        const msg = callbackQuery.message;
        const chatId = msg.chat.id;
        const userId = callbackQuery.from.id;
        const data = callbackQuery.data;

        if (!utils.isAdmin(userId)) return;

        try {
            try {
                await bot.answerCallbackQuery(callbackQuery.id);
            } catch (error) {
                console.error('Ошибка при ответе на callback query:', error.message);
            }

            switch (data) {
                case 'admin_panel':
                    userStates.set(userId, states.ADMIN_PANEL);
                    await utils.safeSendMessage(bot, chatId, '⚙️ Панель администратора', keyboards.getAdminKeyboard());
                    break;

                case 'admin_stats':
                    await handleAdminStats(bot, chatId);
                    break;

                case 'admin_kb':
                    await handleAdminKnowledgeBase(bot, chatId);
                    break;

                case 'admin_pending':
                    await handleAdminPending(bot, chatId);
                    break;

                case 'admin_reload':
                    await handleAdminReload(bot, chatId);
                    break;
            }

            // Обработка просмотра конкретного вопроса
            if (data.startsWith('view_question_')) {
                const targetUserId = data.replace('view_question_', '');
                await handleViewQuestion(bot, chatId, targetUserId);
            }

            // Обработка ответа на вопрос через кнопку
            if (data.startsWith('answer_btn_')) {
                const targetUserId = data.replace('answer_btn_', '');
                userStates.set(userId, states.ADMIN_ANSWERING_BUTTON);
                userStates.set(`${userId}_target_user`, targetUserId);

                const questionData = services.adminAnswers.getPendingQuestions().get(targetUserId);
                const questionText = questionData ? questionData.question : 'Вопрос не найден';

                await utils.safeSendMessage(bot, chatId, `📝 Напишите ответ на вопрос:\n\n"${questionText}"`);
            }

            // Обработка отклонения вопроса через кнопку
            if (data.startsWith('reject_btn_')) {
                const targetUserId = data.replace('reject_btn_', '');
                await handleRejectQuestion(bot, chatId, targetUserId);
            }йден';

                await utils.safeSendMessage(bot, chatId, `✍️ Напишите ваш ответ пользователю ID: ${targetUserId}\n\nВопрос: "${questionText}"`, {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '❌ Отмена', callback_data: 'admin_pending' }
                        ]]
                    }
                });
            }

            // Обработка отклонения вопроса
            if (data.startsWith('reject_btn_')) {
                const targetUserId = data.replace('reject_btn_', '');
                await handleRejectQuestion(bot, chatId, targetUserId);
            }
        } catch (error) {
            console.error("Ошибка в admin callback query обработчике:", error.message);
            try {
                await bot.answerCallbackQuery(callbackQuery.id);
            } catch (answerError) {
                console.error("Не удалось ответить на admin callback query:", answerError.message);
            }
        }
    });

    async function handleAdminStats(bot, chatId) {
        const stats = `📊 Статистика бота:

👥 Активных пользователей в сессии: ${userStates.size}
❓ Вопросов в очереди: ${services.adminAnswers.getPendingQuestions().size}
📚 Записей в базе знаний: ${services.knowledgeBase.getKnowledgeBase().length}
🏠 Номеров в базе данных: ${services.roomsData.getRoomsData().length}`;

        await utils.safeSendMessage(bot, chatId, stats, keyboards.getBackToAdminKeyboard());
    }

    async function handleAdminKnowledgeBase(bot, chatId) {
        let kbInfo = '📚 База знаний:\n\n';
        const knowledgeBase = services.knowledgeBase.getKnowledgeBase();

        if (knowledgeBase.length === 0) {
            kbInfo += 'База знаний пуста';
        } else {
            knowledgeBase.forEach((item, index) => {
                kbInfo += `${index + 1}. Ключевые слова: ${item.keywords.join(', ')}\n`;
                kbInfo += `   Ответ: ${item.answer.substring(0, 100)}${item.answer.length > 100 ? '...' : ''}\n\n`;
            });
        }

        await utils.safeSendMessage(bot, chatId, kbInfo, keyboards.getBackToAdminKeyboard());
    }

    async function handleAdminPending(bot, chatId) {
        const pendingQuestions = services.adminAnswers.getPendingQuestions();

        if (pendingQuestions.size === 0) {
            await utils.safeSendMessage(bot, chatId, '❓ Нет неотвеченных вопросов', keyboards.getBackToAdminKeyboard());
        } else {
            await utils.safeSendMessage(bot, chatId, '❓ Выберите вопрос для ответа:', keyboards.getPendingQuestionsListKeyboard(pendingQuestions));
        }
    }

    async function handleViewQuestion(bot, chatId, userId) {
        const pendingQuestions = services.adminAnswers.getPendingQuestions();
        const questionData = pendingQuestions.get(userId);

        if (!questionData) {
            await utils.safeSendMessage(bot, chatId, '❌ Вопрос не найден', keyboards.getBackToAdminKeyboard());
            return;
        }

        const timestamp = new Date(questionData.timestamp).toLocaleString('ru-RU');
        const questionInfo = `👤 Пользователь ID: ${userId}
📅 Время: ${timestamp}
❓ Вопрос: ${questionData.question}`;

        await utils.safeSendMessage(bot, chatId, questionInfo, keyboards.getQuestionManagementKeyboard(userId));
    }

    async function handleRejectQuestion(bot, chatId, targetUserId) {
        try {
            const rejectionMessage = 'Ваш вопрос некорректен, сформулируйте пожалуйста снова';

            // Убеждаемся, что targetUserId - это число
            const userChatId = typeof targetUserId === 'string' ? parseInt(targetUserId) : targetUserId;

            await utils.safeSendMessage(bot, userChatId, rejectionMessage, keyboards.getMainMenuKeyboard());

            // Удаляем из памяти
            services.adminAnswers.getPendingQuestions().delete(targetUserId.toString());

            // Удаляем из файла
            await services.adminAnswers.removeQuestionFromFile(targetUserId);

            await utils.safeSendMessage(bot, chatId, '✅ Вопрос отклонен и удален из очереди', keyboards.getBackToAdminKeyboard());

        } catch (error) {
            console.error('Ошибка при отклонении вопроса:', error);
            await utils.safeSendMessage(bot, chatId, `❌ Ошибка при отклонении вопроса: ${error.message}`, keyboards.getBackToAdminKeyboard());
        }
    }даемся, что targetUserId - это число
            const targetChatId = typeof targetUserId === 'string' ? parseInt(targetUserId) : targetUserId;

            await utils.safeSendMessage(bot, targetChatId, rejectionMessage, {
                parse_mode: 'Markdown',
                ...mainKeyboards.getBackToMenuKeyboard()
            });

            // Удаляем вопрос из ожидающих
            services.adminAnswers.getPendingQuestions().delete(targetUserId.toString());

            await utils.safeSendMessage(bot, chatId, `✅ Вопрос отклонен, пользователю отправлено сообщение об ошибке`, keyboards.getBackToAdminKeyboard());

        } catch (error) {
            await utils.safeSendMessage(bot, chatId, `❌ Ошибка при отклонении вопроса: ${error.message}`, keyboards.getBackToAdminKeyboard());
        }
    }

    async function handleAdminReload(bot, chatId) {
        try {
            await services.knowledgeBase.loadKnowledgeBase();
            await services.adminAnswers.loadAndProcessAdminAnswers();
            await services.roomsData.loadRoomsData();

            await utils.safeSendMessage(bot, chatId, `✅ База данных обновлена:

📚 Записей в базе знаний: ${services.knowledgeBase.getKnowledgeBase().length}
🏠 Номеров загружено: ${services.roomsData.getRoomsData().length}`, keyboards.getBackToAdminKeyboard());
        } catch (error) {
            await utils.safeSendMessage(bot, chatId, `❌ Ошибка обновления: ${error.message}`, keyboards.getBackToAdminKeyboard());
        }
    }
};