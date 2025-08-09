const fs = require("fs").promises;
const Papa = require("papaparse");
const path = require("path");

let roomsData = [];

// Фотографии для каждого конкретного номера (по ID)
// ВАЖНО: Замените example.com на реальные URL ваших изображений
const roomPhotos = {
    1: [
        "content/rooms/rooms_1/1.webp",
        "content/rooms/rooms_1/2.webp",
        "content/rooms/rooms_1/3.webp",
    ],
    2: [
        "content/rooms/rooms_2/1.webp",
        "content/rooms/rooms_2/2.webp",
        "content/rooms/rooms_2/3.webp",
    ],
    4: [
        "content/rooms/rooms_4/1.webp",
        "content/rooms/rooms_4/2.webp",
        "content/rooms/rooms_4/3.webp",
    ],

    6: [
        "content/rooms/rooms_6/1.webp",
        "content/rooms/rooms_6/2.webp",
        "content/rooms/rooms_6/3.webp",
    ],
    8: [
        "content/rooms/rooms_8/1.webp",
        "content/rooms/rooms_8/2.webp",
        "content/rooms/rooms_8/3.webp",
        "content/rooms/rooms_8/4.webp",
        "content/rooms/rooms_8/5.webp",
        "content/rooms/rooms_8/6.webp",
        "content/rooms/rooms_8/7.webp",
        "content/rooms/rooms_8/8.webp",
        "content/rooms/rooms_8/9.webp",
    ],
    9: [
        "content/rooms/rooms_9/1.webp",
        "content/rooms/rooms_9/2.webp",
        "content/rooms/rooms_9/3.webp",
        "content/rooms/rooms_9/4.webp",
        "content/rooms/rooms_9/5.webp",
        "content/rooms/rooms_9/6.webp",
        "content/rooms/rooms_9/7.webp",
        "content/rooms/rooms_9/8.webp",
        "content/rooms/rooms_9/9.webp",
        "content/rooms/rooms_9/10.webp",
    ],
    10: [
        "content/rooms/rooms_10/2.webp",
        "content/rooms/rooms_10/3.webp",
        "content/rooms/rooms_10/4.webp",
        "content/rooms/rooms_10/5.webp",
        "content/rooms/rooms_10/6.webp",
        "content/rooms/rooms_10/7.webp",
        "content/rooms/rooms_10/8.webp",
        "content/rooms/rooms_10/9.webp",
    ],
    11: [
        "content/rooms/rooms_11/1.webp",
        "content/rooms/rooms_11/2.webp",
        "content/rooms/rooms_11/3.webp",
    ],
    12: [
        "content/rooms/rooms_12/1.webp",
        "content/rooms/rooms_12/2.webp",
        "content/rooms/rooms_12/3.webp",
        "content/rooms/rooms_12/4.webp",
    ],
    13: [
        "content/rooms/rooms_13/1.webp",
        "content/rooms/rooms_13/2.webp",
        "content/rooms/rooms_13/3.webp",
    ],
    14: [
        "content/rooms/rooms_14/1.webp",
        "content/rooms/rooms_14/2.webp",
        "content/rooms/rooms_14/3.webp",
        "content/rooms/rooms_14/4.webp",
        "content/rooms/rooms_14/5.webp",
        "content/rooms/rooms_14/6.webp",
        "content/rooms/rooms_14/7.webp",
    ],
};

// Функция для проверки валидности URL изображения
function isValidImageUrl(url) {
    if (!url || typeof url !== "string") return false;

    // Проверяем, что это не example.com и есть расширение изображения
    const isNotExample = !url.includes("example.com");
    const hasImageExtension = /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i.test(
        url,
    );

    return isNotExample && hasImageExtension;
}

async function loadRoomsData() {
    try {
        const csvFilePath = path.join(__dirname, "../rooms/rooms.csv");
        const data = await fs.readFile(csvFilePath, "utf8");
        const parsed = Papa.parse(data, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true,
            delimiter: ",",
            encoding: "UTF-8",
        });
        roomsData = parsed.data.filter((room) => room && Object.keys(room).length > 1 && room.ID);
        roomsData = roomsData.map((room) => {
            const roomId = parseInt(room.ID);
            const photos = roomPhotos[roomId] || [];
            const validPhotos = photos.filter(isValidImageUrl);
            console.log("Сырой объект room перед обработкой:", JSON.stringify(room, null, 2));
            return {
                ...room,
                ID: roomId,
                photos: validPhotos,
                hasPhotos: validPhotos.length > 0,
            };
        });
        console.log("Полные данные roomsData после парсинга:", JSON.stringify(roomsData, null, 2));
        return roomsData;
    } catch (error) {
        console.error("❌ Ошибка загрузки локального CSV файла:", error);
        throw error;
    }
}

function getRoomsData() {
    return roomsData;
}

// Функция для получения фотографий конкретного номера по ID
function getRoomPhotos(roomId) {
    // Приводим к числу для корректного сравнения
    const numericId = parseInt(roomId);

    if (isNaN(numericId)) {
        console.error(`❌ Некорректный ID номера: ${roomId}`);
        return [];
    }

    const photos = roomPhotos[numericId] || [];
    const validPhotos = photos.filter(isValidImageUrl);

    console.log(
        `Запрос фотографий для номера ${roomId} (приведен к ${numericId})`,
    );
    console.log(
        `Найдено фотографий: ${photos.length}, валидных: ${validPhotos.length}`,
    );

    if (validPhotos.length === 0) {
        console.warn(`⚠️ Нет валидных фотографий для номера ${numericId}`);
    } else {
        console.log(`✅ Валидные фотографии:`, validPhotos);
    }

    return validPhotos;
}

// Функция для получения конкретного номера с фотографиями
function getRoomById(roomId) {
    // Приводим к числу для корректного сравнения
    const numericId = parseInt(roomId);

    if (isNaN(numericId)) {
        console.error(`❌ Некорректный ID номера: ${roomId}`);
        return null;
    }

    const room = roomsData.find((room) => room.ID === numericId);

    if (room) {
        console.log(`✅ Найден номер ${numericId}`);
        console.log(`Фотографии номера ${numericId}:`, room.photos);
        console.log(`Количество фотографий: ${room.photos.length}`);
        console.log(`Есть ли валидные фотографии: ${room.hasPhotos}`);

        return room;
    } else {
        console.log(`❌ Номер ${numericId} не найден`);
        console.log(
            "Доступные номера:",
            roomsData.map((r) => r.ID),
        );
        return null;
    }
}

// Функция для проверки доступности изображения по URL
async function checkImageUrl(url) {
    try {
        const response = await fetch(url, { method: "HEAD" });
        const isValid =
            response.ok &&
            response.headers.get("content-type")?.startsWith("image/");
        console.log(
            `Проверка URL ${url}: ${isValid ? "✅ доступен" : "❌ недоступен"}`,
        );
        return isValid;
    } catch (error) {
        console.log(`Ошибка при проверке URL ${url}:`, error.message);
        return false;
    }
}

// Функция для массовой проверки всех фотографий (опционально)
async function validateAllPhotos() {
    console.log("🔍 Начинаем проверку всех фотографий...");

    for (const [roomId, photos] of Object.entries(roomPhotos)) {
        console.log(`\n--- Проверка номера ${roomId} ---`);

        for (let i = 0; i < photos.length; i++) {
            const url = photos[i];
            const isValid = await checkImageUrl(url);

            if (!isValid) {
                console.warn(
                    `⚠️ Проблема с фотографией ${i + 1} номера ${roomId}: ${url}`,
                );
            }
        }
    }

    console.log("✅ Проверка всех фотографий завершена");
}

function decodeHtml(html) {
    const txt = document.createElement("textarea");
    txt.innerHTML = html;
    return txt.value;
}


const he = require('he');

function getRoomsKeyboard(roomsData) {
    const keyboard = [];
    for (let i = 0; i < roomsData.length; i += 2) {
        const row = [];
        const room1 = roomsData[i];
        const room1Text = room1.Комнат && room1.Комнат !== null && room1.Комнат !== ""
            ? `${he.decode(room1.Название)} (${room1.Комнат})`
            : he.decode(room1.Название);

        row.push({
            text: room1Text,
            callback_data: `room_${i}`,
        });

        if (i + 1 < roomsData.length) {
            const room2 = roomsData[i + 1];
            const room2Text = room2.Комнат && room2.Комнат !== null && room2.Комнат !== ""
                ? `${he.decode(room2.Название)} (${room2.Комнат})`
                : he.decode(room2.Название);

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
    return {
        reply_markup: {
            inline_keyboard: keyboard,
        },
    };
}

module.exports = {
    loadRoomsData,
    getRoomsData,
    getRoomPhotos,
    getRoomById,
    validateAllPhotos,
    isValidImageUrl,
    getRoomsKeyboard, // Добавьте эту функцию в экспорт, если её там ещё нет
};
