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
    },

    getPendingQuestionsListKeyboard(pendingQuestions) {
        const keyboard = [];
        
        let count = 1;
        for (const [userId, questionData] of pendingQuestions) {
            if (count > 8) break; // Ограничиваем количество кнопок
            
            const preview = questionData.question.length > 30 
                ? questionData.question.substring(0, 30) + '...'
                : questionData.question;
            
            // Убеждаемся, что userId передается корректно
            keyboard.push([{ 
                text: `❓ ${count}. ${preview}`, 
                callback_data: `view_question_${userId.toString()}` 
            }]);
            count++;
        }
        
        keyboard.push([{ text: '🔙 Админ-панель', callback_data: 'admin_panel' }]);
        
        return {
            reply_markup: {
                inline_keyboard: keyboard
            }
        };
    },

    getQuestionManagementKeyboard(userId) {
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ Ответить на вопрос', callback_data: `answer_btn_${userId.toString()}` },
                        { text: '❌ Отклонить вопрос', callback_data: `reject_btn_${userId.toString()}` }
                    ],
                    [
                        { text: '🔙 К списку вопросов', callback_data: 'admin_pending' }
                    ]
                ]
            }
        };
    }
};