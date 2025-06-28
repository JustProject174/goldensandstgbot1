module.exports = {
    getAdminKeyboard() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📊 Статистика', callback_data: 'admin_stats' }],
                    [{ text: '📚 База знаний', callback_data: 'admin_kb' }],
                    [{ text: '❓ Неотвеченные', callback_data: 'admin_pending' }],
                    [{ text: '🔄 Обновить данные', callback_data: 'admin_reload' }],
                    [{ text: '🔙 Главное меню', callback_data: 'back_to_menu' }]
                ]
            }
        };
    },

    getBackToAdminKeyboard() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔙 Админ-панель', callback_data: 'admin_panel' }],
                    [{ text: '🏠 Главное меню', callback_data: 'back_to_menu' }]
                ]
            }
        };
    }
};