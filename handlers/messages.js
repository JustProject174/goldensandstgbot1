const states = require('../states');
const utils = require('../utils');
const services = {
    knowledgeBase: require('../services/knowledgeBase'),
    roomsData: require('../services/roomsData'),
    adminAnswers: require('../services/adminAnswers')
};
const keyboards = require('../keyboards/mainMenu');

module.exports = function setupMessageHandlers(bot, userStates) {
    bot.on('message', async (msg) => {
        if (!msg.text || msg.text.startsWith('/') || msg.text.match(/меню|menu/i)) {
            return;
        }

        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const username = msg.from.username;
        const messageText = msg.text.trim();

        if (!messageText) return;

        const userState = userStates.get(userId) || states.MAIN_MENU;

        // Обработка ответа администратора с ключевыми словами
        if (userState === states.ADMIN_ANSWERING && utils.isAdmin(userId)) {
            const answerData = userStates.get(`${userId}_answer_data`);
            if (answerData) {
                const keywords = messageText.split(',').map(k => k.trim()).filter(k => k);

                if (keywords.length > 0) {
                    try {
                        // Приводим userId к строке для консистентности
                        const targetUserId = answerData.targetUserId.toString();

                        // Обновляем файл администратора (НЕ добавляем в базу знаний сразу)
                        await services.adminAnswers.updateAdminAnswer(targetUserId, answerData.answer, keywords);

                        // Очищаем состояние
                        userStates.delete(`${userId}_answer_data`);
                        userStates.set(userId, states.MAIN_MENU);

                        await utils.safeSendMessage(bot, chatId, `✅ Ответ сохранен и будет добавлен в базу знаний с ключевыми словами: ${keywords.join(', ')}`);
                    } catch (error) {
                        console.error('Ошибка при сохранении ответа:', error);
                        await utils.safeSendMessage(bot, chatId, '❌ Произошла ошибка при сохранении. Попробуйте ещё раз.');
                    }
                } else {
                    await utils.safeSendMessage(bot, chatId, '❌ Укажите хотя бы одно ключевое слово');
                }
            }
            // ВАЖНО: прерываем выполнение для администратора в ЛЮБОМ случае
            return;
        }

        // Если администратор не в состоянии ADMIN_ANSWERING, но все равно администратор - тоже прерываем
        if (utils.isAdmin(userId)) {
            return;
        }

        // Проверка специальных команд
        if (messageText.toLowerCase().includes('трансфер')) {
            userStates.set(userId, states.TRANSFER_REQUEST);
            await utils.safeSendMessage(bot, chatId, `🚖 Заказ трансфера

Для оформления трансфера, пожалуйста, укажите:
• Дату и время
• Количество человек
• Откуда забрать
• Контактный телефон

Наш менеджер свяжется с вами для уточнения деталей.`, 
                { parse_mode: 'Markdown' });
            return;
        }

        // Проверяем, есть ли уже ожидающий вопрос от этого пользователя
        const pendingQuestions = services.adminAnswers.getPendingQuestions();
        const hasPendingQuestion = pendingQuestions.has(userId.toString());

        // Поиск в базе знаний
        const autoAnswer = services.knowledgeBase.findAnswerInKnowledgeBase(messageText);

        if (autoAnswer) {
            // Если есть автоответ, удаляем ожидающий вопрос (если был)
            if (hasPendingQuestion) {
                pendingQuestions.delete(userId.toString());
            }
            await utils.safeSendMessage(bot, chatId, autoAnswer, { 
                parse_mode: 'Markdown',
                ...keyboards.getBackToMenuKeyboard()
            });
        } else {
            // Сохраняем вопрос только если нет ожидающего вопроса от этого пользователя
            if (!hasPendingQuestion) {
                await services.adminAnswers.saveUnknownQuestion(userId, username, messageText);

                await utils.safeSendMessage(bot, chatId, `Спасибо за ваш вопрос! 🤔

Я передам его нашему менеджеру, и он ответит вам в ближайшее время.

А пока вы можете воспользоваться меню с готовыми ответами 👇`, 
                    keyboards.getMainMenuKeyboard());

                await utils.forwardToAdmins(bot, userId, username, messageText);
            } else {
                await utils.safeSendMessage(bot, chatId, `Ваш предыдущий вопрос еще обрабатывается. 

Пожалуйста, дождитесь ответа от менеджера или воспользуйтесь меню с готовыми ответами 👇`, 
                    keyboards.getMainMenuKeyboard());
            }
        }
    });
};