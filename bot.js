const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const utils = require('./utils');
const states = require('./states');

// Инициализация сервисов
const knowledgeBaseService = require('./services/knowledgeBase');
const roomsDataService = require('./services/roomsData');
const adminAnswersService = require('./services/adminAnswers');

// Проверка токена
if (!config.BOT_TOKEN) {
    console.error('❌ ОШИБКА: Токен бота не найден! Проверьте файл .env');
    process.exit(1);
}

console.log('✅ Токен бота загружен успешно');
const bot = new TelegramBot(config.BOT_TOKEN, { polling: true });

// Хранилище состояний пользователей
const userStates = new Map();

// Инициализация обработчиков
const setupMainMenuHandlers = require('./handlers/mainMenu');
const setupAdminHandlers = require('./handlers/adminPanel');
const setupMessageHandlers = require('./handlers/messages');

// Инициализация бота
async function initializeBot() {
    try {
        console.log('🚀 Запуск бота...');

        // Загружаем данные
        await knowledgeBaseService.loadKnowledgeBase();
        await adminAnswersService.loadAndProcessAdminAnswers();
        await roomsDataService.loadRoomsData();

        // Настраиваем обработчики
        setupMainMenuHandlers(bot, userStates);
        setupAdminHandlers(bot, userStates);
        setupMessageHandlers(bot, userStates);

        console.log('✅ Бот успешно запущен и готов к работе!');
        console.log(`📊 Статистика загрузки:
- База знаний: ${knowledgeBaseService.getKnowledgeBase().length} записей
- Номерной фонд: ${roomsDataService.getRoomsData().length} номеров
- Администраторов: ${config.admins.length}`);

    } catch (error) {
        console.error('❌ Ошибка при инициализации бота:', error);
        process.exit(1);
    }
}

// Данные номеров загружаются из локального CSV файла
// Для обновления данных нужно изменить файл rooms/rooms.csv и перезапустить бота

// Обработка ошибок
bot.on('error', (error) => {
    console.error('Ошибка бота:', error);
});

bot.on('polling_error', (error) => {
    console.error('Ошибка polling:', error);
});

// Запуск бота
initializeBot();


bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data.startsWith('answer_')) {
        const userId = data.split('_')[1];

        await bot.sendMessage(chatId, `Введите ответ для пользователя ID ${userId}:`, {
            reply_markup: { force_reply: true }
        });

        bot.once('message', async (msg) => {
            const answer = msg.text;

            // Отправляем ответ пользователю
            await bot.sendMessage(userId, `💬 Администратор ответил:\n\n${answer}`);

            // Здесь можно сохранить ответ в БД
            // await saveAnswerToDB(userId, answer);

            await bot.sendMessage(chatId, '✅ Ответ отправлен пользователю.');
        });
    }

    await bot.answerCallbackQuery(query.id);
});
