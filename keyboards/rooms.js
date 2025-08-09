/**
 * Клавиатуры для работы с номерами
 */
const he = require('he');

function getRoomsKeyboard(roomsData) {
    const keyboard = [];
    for (let i = 0; i < roomsData.length; i += 2) {
        const row = [];
        const room1 = roomsData[i];
        const room1Text = room1.Комнат && room1.Комнат !== null && room1.Комнат !== ""
            ? `${room1.Название} (${room1.Комнат})`
            : room1.Название;
        console.log(`Исходный текст кнопки 1: ${room1Text}`); // Отладка

        row.push({
            text: room1Text,
            callback_data: `room_${i}`,
        });

        if (i + 1 < roomsData.length) {
            const room2 = roomsData[i + 1];
            const room2Text = room2.Комнат && room2.Комнат !== null && room2.Комнат !== ""
                ? `${room2.Название} (${room2.Комнат})`
                : room2.Название;
            console.log(`Исходный текст кнопки 2: ${room2Text}`); // Отладка

            row.push({
                text: room2Text,
                callback_data: `room_${i + 1}`,
            });
        }
        keyboard.push(row);
    }
    keyboard.push([
        {
            text: "🔙 Назад в меню",
            callback_data: "back_to_menu",
        },
    ]);
    console.log("Сформированная клавиатура:", JSON.stringify(keyboard, null, 2));
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
