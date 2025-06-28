/**
 * Клавиатуры для работы с номерами
 */

function getRoomsKeyboard(roomsData) {
    const keyboard = [];

    // Создаем кнопки для каждого номера (по 2 в ряд)
    for (let i = 0; i < roomsData.length; i += 2) {
        const row = [];

        // Добавляем первый номер в ряд
        const room1 = roomsData[i];
        row.push({
            text: `${room1.Название} (${room1.Вместимость} чел.)`,
            callback_data: `room_${i}`,
        });

        // Добавляем второй номер в ряд, если он существует
        if (i + 1 < roomsData.length) {
            const room2 = roomsData[i + 1];
            row.push({
                text: `${room2.Название} (${room2.Вместимость} чел.)`,
                callback_data: `room_${i + 1}`,
            });
        }

        keyboard.push(row);
    }

    // Добавляем кнопку "Назад в меню"
    keyboard.push([
        {
            text: "🔙 Назад в меню",
            callback_data: "back_to_menu",
        },
    ]);

    return {
        reply_markup: {
            inline_keyboard: keyboard,
        },
    };
}

function getRoomDetailsKeyboard() {
    return {
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: "🔙 К списку номеров",
                        callback_data: "rooms",
                    },
                    {
                        text: "🏠 Главное меню",
                        callback_data: "back_to_menu",
                    },
                ],
                [
                    {
                        text: "📞 Забронировать",
                        callback_data: "booking",
                    },
                ],
            ],
        },
    };
}

function getRoomCategoryKeyboard() {
    return {
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: "🏠 Комфорт",
                        callback_data: "rooms_comfort",
                    },
                    {
                        text: "🛏️ Эконом",
                        callback_data: "rooms_economy",
                    },
                ],
                [
                    {
                        text: "🔙 Назад в меню",
                        callback_data: "back_to_menu",
                    },
                ],
            ],
        },
    };
}

module.exports = {
    getRoomsKeyboard,
    getRoomDetailsKeyboard,
    getRoomCategoryKeyboard,
};
