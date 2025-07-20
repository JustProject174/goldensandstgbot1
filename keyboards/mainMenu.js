module.exports = {
    // Функция для безопасного экранирования HTML
    escapeHtml(text) {
        if (!text) return "";
        return text
            .toString()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#x27;");
    },

    // Функция для безопасного форматирования сообщений
    formatSafeMessage(text, parseMode = "HTML") {
        if (parseMode === "HTML") {
            // Убираем parse_mode если есть проблемы с HTML
            return {
                text: this.escapeHtml(text),
                parse_mode: undefined,
            };
        }
        return {
            text: text,
            parse_mode: parseMode,
        };
    },

    getMainMenuKeyboard() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "📌 Важная информация",
                            callback_data: "important_info",
                        },
                    ],
                    [
                        {
                            text: "🏠 Номера и цены",
                            callback_data: "rooms",
                        },
                    ],
                    [
                        {
                            text: "🏖 Развлечения",
                            callback_data: "entertainment",
                        },
                    ],
                    [
                        {
                            text: "🍽️ Удобства",
                            callback_data: "facilities",
                        },
                    ],
                    [
                        {
                            text: "⛺ Размещение с палатками",
                            callback_data: "camping",
                        },
                    ],
                    [
                        {
                            text: "🏖️ Посещение нашего пляжа",
                            callback_data: "our_beach",
                        },
                    ],
                    [
                        {
                            text: "🍖 Аренда мангальной зоны",
                            callback_data: "Mangalchik",
                        },
                    ],
                    [
                        {
                            text: "📍 Как добраться",
                            callback_data: "directions",
                        },
                    ],
                    [
                        {
                            text: "📞 Бронирование",
                            callback_data: "booking",
                        },
                    ],
                ],
            },
        };
    },

    getBackToMenuKeyboard() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "🔙 Главное меню",
                            callback_data: "back_to_menu",
                        },
                    ],
                ],
            },
        };
    },

    getBookingKeyboard() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "✅ Да, был(а)",
                            callback_data: "booking_yes",
                        },
                    ],
                    [
                        {
                            text: "❌ Нет, впервые",
                            callback_data: "booking_no",
                        },
                    ],
                    [
                        {
                            text: "🔙 Главное меню",
                            callback_data: "back_to_menu",
                        },
                    ],
                ],
            },
        };
    },

    getRoomsKeyboard(roomsData) {
        const keyboard = [];
        if (roomsData && Array.isArray(roomsData)) {
            roomsData.forEach((room, index) => {
                // Безопасное получение названия номера
                const roomName =
                    room?.Название || room?.название || `Номер ${index + 1}`;
                const safeRoomName = this.escapeHtml(roomName);

                keyboard.push([
                    {
                        text: `🏠 ${safeRoomName}`,
                        callback_data: `room_${index}`,
                    },
                ]);
            });
        }
        keyboard.push([
            {
                text: "🔙 Главное меню",
                callback_data: "back_to_menu",
            },
        ]);

        return {
            reply_markup: {
                inline_keyboard: keyboard,
            },
        };
    },

    getRoomDetailsKeyboard() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "📞 Забронировать",
                            callback_data: "booking",
                        },
                    ],
                    [
                        {
                            text: "🔙 К списку номеров",
                            callback_data: "rooms",
                        },
                    ],
                    [
                        {
                            text: "🏠 Главное меню",
                            callback_data: "back_to_menu",
                        },
                    ],
                ],
            },
        };
    },

    // Дополнительные клавиатуры для админских функций
    getAdminKeyboard() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "📋 Ожидающие вопросы",
                            callback_data: "pending_questions",
                        },
                        {
                            text: "📊 Статистика",
                            callback_data: "admin_stats",
                        },
                    ],
                    [
                        {
                            text: "⚙️ Настройки",
                            callback_data: "admin_settings",
                        },
                        {
                            text: "📝 База знаний",
                            callback_data: "knowledge_base",
                        },
                    ],
                    [
                        {
                            text: "🔙 Главное меню",
                            callback_data: "back_to_menu",
                        },
                    ],
                ],
            },
        };
    },

    getAnswerManagementKeyboard(userId) {
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "✅ Ответить",
                            callback_data: `answer_question_${userId}`,
                        },
                        {
                            text: "❌ Удалить",
                            callback_data: `delete_question_${userId}`,
                        },
                    ],
                    [
                        {
                            text: "🔙 К вопросам",
                            callback_data: "pending_questions",
                        },
                    ],
                ],
            },
        };
    },

    getPendingQuestionsKeyboard(questions) {
        const keyboard = [];

        // Добавляем кнопки для каждого ожидающего вопроса (максимум 8-10)
        let count = 0;
        if (questions && questions.size > 0) {
            for (const [userId, questionData] of questions) {
                if (count >= 8) break; // Ограничиваем количество кнопок

                const question = questionData?.question || "Без текста";
                const questionPreview =
                    question.length > 30
                        ? question.substring(0, 30) + "..."
                        : question;

                // Экранируем текст для безопасности
                const safePreview = this.escapeHtml(questionPreview);

                keyboard.push([
                    {
                        text: `❓ ${safePreview}`,
                        callback_data: `view_question_${userId}`,
                    },
                ]);
                count++;
            }
        }

        if (!questions || questions.size === 0) {
            keyboard.push([
                {
                    text: "📭 Нет ожидающих вопросов",
                    callback_data: "no_questions",
                },
            ]);
        }

        keyboard.push([
            {
                text: "🔙 Админ панель",
                callback_data: "admin_menu",
            },
        ]);
        keyboard.push([
            {
                text: "🏠 Главное меню",
                callback_data: "back_to_menu",
            },
        ]);

        return {
            reply_markup: {
                inline_keyboard: keyboard,
            },
        };
    },

    getConfirmationKeyboard(actionType, data = "") {
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "✅ Да",
                            callback_data: `confirm_${actionType}_${data}`,
                        },
                        {
                            text: "❌ Нет",
                            callback_data: `cancel_${actionType}_${data}`,
                        },
                    ],
                ],
            },
        };
    },

    // Клавиатура для удаления (убирает все кнопки)
    removeKeyboard() {
        return {
            reply_markup: {
                remove_keyboard: true,
            },
        };
    },

    // Функция для создания безопасного сообщения с клавиатурой
    createSafeMessage(text, keyboard = null, parseMode = null) {
        const message = {
            text: parseMode === "HTML" ? text : this.escapeHtml(text),
        };

        if (parseMode && parseMode !== "HTML") {
            message.parse_mode = parseMode;
        }

        if (keyboard) {
            message.reply_markup = keyboard.reply_markup || keyboard;
        }

        return message;
    },
};
