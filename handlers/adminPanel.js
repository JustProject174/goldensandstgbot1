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
        
        // Экранируем специальные символы Markdown
        answer = answer.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
        
        try {
            await utils.safeSendMessage(bot, targetUserId, `💬 Ответ от менеджера:\n\n${answer}`, {
                parse_mode: 'Markdown',
                ...mainKeyboards.getBackToMenuKeyboard() // Используем mainKeyboards
            });
            
            services.adminAnswers.getPendingQuestions().delete(targetUserId);
            
            userStates.set(userId, states.ADMIN_ANSWERING);
            userStates.set(`${userId}_answer_data`, { targetUserId, answer });
            
            await utils.safeSendMessage(bot, chatId, `✅ Ответ отправлен пользователю\\.\n\nТеперь укажите ключевые слова через запятую для добавления в базу знаний:\n\n_Например: бронирование, резерв, забронировать_`, {
                parse_mode: 'MarkdownV2'
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
            await bot.answerCallbackQuery(callbackQuery.id);
        } catch (error) {
            console.error('Ошибка ответа на callback:', error.message);
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
        let pendingInfo = '❓ Неотвеченные вопросы:\n\n';
        const pendingQuestions = services.adminAnswers.getPendingQuestions();
        
        if (pendingQuestions.size === 0) {
            pendingInfo += 'Нет неотвеченных вопросов';
        } else {
            let count = 1;
            for (const [userId, questionData] of pendingQuestions) {
                const timestamp = new Date(questionData.timestamp).toLocaleString('ru-RU');
                pendingInfo += `${count}. ID: ${userId}\n`;
                pendingInfo += `   Время: ${timestamp}\n`;
                pendingInfo += `   Вопрос: ${questionData.question}\n\n`;
                count++;
            }
        }
        
        await utils.safeSendMessage(bot, chatId, pendingInfo, keyboards.getBackToAdminKeyboard());
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