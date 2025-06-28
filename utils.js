const path = require('path');
const fs = require('fs').promises;
const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');

// Безопасная отправка сообщения
async function safeSendMessage(bot, chatId, text, options = {}) {
    try {
        // Проверяем валидность chatId
        if (!chatId || isNaN(chatId)) {
            console.error(`Неверный chat ID: ${chatId}`);
            return;
        }
        
        await bot.sendMessage(chatId, text, options);
    } catch (error) {
        console.error(`Ошибка отправки сообщения пользователю ${chatId}:`, error.message);
        
        // Если чат не найден, не пытаемся повторно отправить
        if (error.message.includes('chat not found')) {
            console.error(`Чат ${chatId} не найден или заблокирован`);
            return;
        }
        try {
            // Более тщательная очистка текста от специальных символов
            let cleanText = text.toString()
                .replace(/[*_`\[\]()~>#+\-=|{}.!\\]/g, '') // Удаляем все markdown символы
                .replace(/\n{3,}/g, '\n\n') // Убираем избыточные переносы строк
                .trim();

            // Отправляем без форматирования
            await bot.sendMessage(chatId, cleanText, { ...options, parse_mode: undefined });
        } catch (secondError) {
            console.error(`Критическая ошибка отправки сообщения пользователю ${chatId}:`, secondError.message);
            // Последняя попытка с минимальным текстом
            try {
                await bot.sendMessage(chatId, 'Извините, произошла ошибка при отправке сообщения.');
            } catch (finalError) {
                console.error(`Невозможно отправить сообщение пользователю ${chatId}:`, finalError.message);
            }
        }
    }
}

// Проверка администратора
function isAdmin(userId) {
    return config.admins.includes(userId);
}

// Пересылка сообщения администраторам
async function forwardToAdmins(bot, userId, username, message) {
    if (config.admins.length === 0) {
        console.log('Нет настроенных администраторов');
        return;
    }

    const userInfo = username ? `@${username}` : `ID: ${userId}`;
    const adminMessage = `❓ Новый вопрос от пользователя ${userInfo}:\n\n${message}\n\n_Для ответа используйте: /answer ${userId} [ваш ответ]_`;

    for (const adminId of config.admins) {
        await safeSendMessage(bot, adminId, adminMessage, { parse_mode: 'Markdown' });
    }
}

module.exports = {
    safeSendMessage,
    isAdmin,
    forwardToAdmins
};