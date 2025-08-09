// Импорт необходимых клавиатур
const mainMenuKeyboards = require("../keyboards/mainMenu"); // Путь к вашему файлу с клавиатурами
mainMenuKeyboards.getMainMenuKeyboard()
const config = require("../config"); // Импорт конфигурации

function setupCommandHandlers(bot, userStates) {
    // Команда /menu
    bot.onText(/\/menu/, (msg) => {
        const chatId = msg.chat.id;
        const keyboard = getMainMenuKeyboard(); // Используйте вашу существующую клавиатуру
        bot.sendMessage(chatId, "🏠 Главное меню", keyboard);
    });

    // Команда /book
    bot.onText(/\/book/, (msg) => {
        const chatId = msg.chat.id;
        // Сначала спрашиваем, были ли у нас
        bot.sendMessage(chatId, "❓ Были ли вы у нас раньше?").then(() => {
            // Затем отправляем клавиатуру бронирования
            bot.sendMessage(
                chatId,
                "📅 Бронирование номеров",
                mainMenuKeyboards.getBookingKeyboard(),
            );
        });
    });

    // Команда /admin (только для админского чата)
    bot.onText(/\/admin/, (msg) => {
        const chatId = msg.chat.id;
        const messageThreadId = msg.message_thread_id;

        if (
            config.ADMIN_CHAT_ID &&
            chatId == config.ADMIN_CHAT_ID &&
            messageThreadId === 102
        ) {
            const { getAdminKeyboard } = require("../keyboards/adminPanel");
            bot.sendMessage(chatId, "📊 Админ-панель", {
                ...getAdminKeyboard(),
                message_thread_id: 102,
            });
        } else {
            bot.sendMessage(chatId, "❌ У вас нет доступа к админ-панели");
        }
    });
}

module.exports = setupCommandHandlers;
