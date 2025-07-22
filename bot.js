const TelegramBot = require("node-telegram-bot-api");
const express = require("express"); // Добавляем Express
const config = require("./config");
const utils = require("./utils");
const states = require("./states");
const { setupCommands } = require("./commands");
const setupMainMenuHandlers = require("./handlers/mainMenu");
const setupAdminHandlers = require("./handlers/adminPanel");
const setupMessageHandlers = require("./handlers/messages");
const setupCommandHandlers = require("./handlers/commands");

// Инициализация сервисов
const knowledgeBaseService = require("./services/knowledgeBase");
const roomsDataService = require("./services/roomsData");
const adminAnswersService = require("./services/adminAnswers");

// Проверка токена
if (!config.BOT_TOKEN) {
    console.error("❌ ОШИБКА: Токен бота не найден! Проверьте файл .env");
    process.exit(1);
}

console.log("✅ Токен бота загружен успешно");
const bot = new TelegramBot(config.BOT_TOKEN, { polling: true });

// Хранилище состояний пользователей
const userStates = new Map();

// Создаем HTTP-сервер с Express
const app = express();
const PORT = process.env.PORT || 3000; // Порт для сервера, можно настроить в .env

// Эндпоинт для UptimeRobot
app.get("/health", (req, res) => {
    res.status(200).send("OK"); // Отвечаем 200 OK для UptimeRobot
});

// Запускаем сервер
app.listen(PORT, () => {
    console.log(`🌐 HTTP-сервер запущен на порту ${PORT}`);
});

// Инициализация бота
async function initializeBot() {
    try {
        console.log("🚀 Запуск бота...");

        // Загружаем данные
        await knowledgeBaseService.loadKnowledgeBase();
        await adminAnswersService.loadAndProcessAdminAnswers();
        await roomsDataService.loadRoomsData();

        // Устанавливаем команды меню
        await setupCommands(bot);

        // Проверяем данные перед логированием
        const knowledgeBase = knowledgeBaseService.getKnowledgeBase();
        const roomsData = roomsDataService.getRoomsData();
        const admins = config.admins;

        if (!knowledgeBase) {
            console.warn("⚠️ База знаний не инициализирована или пуста");
        }
        if (!roomsData) {
            console.warn("⚠️ Данные номеров не инициализированы или пусты");
        }
        if (!admins) {
            console.warn("⚠️ Список администраторов не определён в config.js");
        }

        // Настраиваем обработчики
        setupMainMenuHandlers(bot, userStates);
        setupAdminHandlers(bot, userStates);
        setupMessageHandlers(bot, userStates);
        setupCommandHandlers(bot, userStates);

        console.log("✅ Бот успешно запущен и готов к работе!");
        console.log(`📊 Статистика загрузки:
- База знаний: ${knowledgeBase ? knowledgeBase.length : 0} записей
- Номерной фонд: ${roomsData ? roomsData.length : 0} номеров
- Администраторов: ${admins ? admins.length : 0}`);
    } catch (error) {
        console.error("❌ Ошибка при инициализации бота:", error);
        process.exit(1);
    }
}

// Обработка ошибок
bot.on("error", (error) => {
    console.error("Ошибка бота:", error);
});

bot.on("polling_error", (error) => {
    console.error("Ошибка polling:", error);
});

// Обработка завершения процесса
process.on("SIGINT", () => {
    console.log("Получен сигнал SIGINT, завершаем работу...");
    knowledgeBaseService.closeFileWatcher();
    process.exit(0);
});

process.on("SIGTERM", () => {
    console.log("Получен сигнал SIGTERM, завершаем работу...");
    knowledgeBaseService.closeFileWatcher();
    process.exit(0);
});

// Запуск бота
initializeBot();