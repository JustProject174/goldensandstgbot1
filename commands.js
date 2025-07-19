// commands.js
const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');

// Команды для админского чата
const adminCommands = [
    { command: "start", description: "🚀 Запустить бота" },
    { command: "admin", description: "📊 Админ-панель" }
];

// Команды для обычных пользователей
const userCommands = [
    { command: "start", description: "🚀 Запустить бота" },
    { command: "menu", description: "🏠 Главное меню" },
    { command: "book", description: "📅 Забронировать" }
];

async function setupCommands(bot) {
    try {
        // Если есть админский чат ID в конфиге
        if (config.ADMIN_CHAT_ID) {
            await bot.setMyCommands(adminCommands, {
                scope: {
                    type: 'chat',
                    chat_id: config.ADMIN_CHAT_ID
                }
            });
            console.log('✅ Команды для админского чата установлены');
        }

        // Команды по умолчанию для всех пользователей
        await bot.setMyCommands(userCommands);
        console.log('✅ Команды для пользователей установлены');

    } catch (error) {
        console.error('❌ Ошибка установки команд:', error);
    }
}

module.exports = { setupCommands };