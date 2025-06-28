const fs = require("fs").promises;
const Papa = require("papaparse");
const path = require("path");

let roomsData = [];

// Фотографии для каждого конкретного номера (по ID)
// ВАЖНО: Замените example.com на реальные URL ваших изображений
const roomPhotos = {
    1: [
        "https://optim.tildacdn.com/tild3763-3238-4564-b264-636233333163/-/format/webp/IMG_6017.JPG.webp",
        "https://optim.tildacdn.com/tild3732-3866-4166-b036-303231376162/-/format/webp/2025-06-27_22-03-09.JPG.webp",
        "https://optim.tildacdn.com/tild3232-6431-4735-b264-323733353565/-/format/webp/WhatsApp_Image_2025-.jpeg.webp",
    ],
    2: [
        "https://optim.tildacdn.com/tild3063-3937-4763-b761-383339613662/-/contain/673x897/center/center/-/format/webp/IMG_2914.jpg.webp",
        "https://optim.tildacdn.com/tild3139-3639-4532-b664-613564386239/-/contain/673x897/center/center/-/format/webp/IMG_2873.jpg.webp",
        "https://optim.tildacdn.com/tild3232-6431-4735-b264-323733353565/-/format/webp/WhatsApp_Image_2025-.jpeg.webp",
    ],
    4: [
        "https://optim.tildacdn.com/tild3934-3338-4133-b965-353239373962/-/contain/667x889/center/center/-/format/webp/d13a7430-ec9d-4bff-b.jpg.webp",
        "https://optim.tildacdn.com/tild6462-6134-4363-b539-356263626363/-/contain/633x844/center/center/-/format/webp/PHOTO-2023-06-16-21-.jpg.webp",
        "https://optim.tildacdn.com/tild3232-6431-4735-b264-323733353565/-/format/webp/WhatsApp_Image_2025-.jpeg.webp",
    ],

    6: [
        "https://optim.tildacdn.com/tild6231-3533-4033-b436-326533326139/-/format/webp/IMG_6014.JPG.webp",
        "https://optim.tildacdn.com/tild6462-6134-4363-b539-356263626363/-/contain/633x844/center/center/-/format/webp/PHOTO-2023-06-16-21-.jpg.webp",
        "https://optim.tildacdn.com/tild3232-6431-4735-b264-323733353565/-/format/webp/WhatsApp_Image_2025-.jpeg.webp",
    ],
    8: [
        "https://optim.tildacdn.com/tild3065-6331-4661-a433-346130636365/-/format/webp/2024-06-27_133428.jpg.webp",
        "https://optim.tildacdn.com/tild3733-3332-4432-b334-306662396533/-/contain/661x881/center/center/-/format/webp/2024-06-28_122252.jpg.webp",
        "https://optim.tildacdn.com/tild6334-6662-4536-b735-323334356235/-/contain/661x881/center/center/-/format/webp/2024-06-28_163554.jpg.webp",
        "https://optim.tildacdn.com/tild3037-3437-4638-b237-306362356136/-/contain/661x881/center/center/-/format/webp/2024-06-28_163615.jpg.webp",
        "https://optim.tildacdn.com/tild6133-3865-4538-a461-353239613462/-/contain/661x881/center/center/-/format/webp/IMG_2912.jpg.webp",
        "https://optim.tildacdn.com/tild6334-6630-4562-a266-396639393964/-/contain/661x881/center/center/-/format/webp/IMG_2909.jpg.webp",
        "https://optim.tildacdn.com/tild3565-3835-4331-b239-346530636339/-/contain/661x881/center/center/-/format/webp/IMG_2911.jpg.webp",
        "https://optim.tildacdn.com/tild3866-6334-4263-a232-666563616432/-/contain/661x881/center/center/-/format/webp/IMG_2910.jpg.webp",
        "https://optim.tildacdn.com/tild3232-6431-4735-b264-323733353565/-/format/webp/WhatsApp_Image_2025-.jpeg.webp",
    ],
    9: [
        "https://optim.tildacdn.com/tild3131-3361-4338-b136-326233366237/-/format/webp/IMG_3669.jpg.webp",
        "https://optim.tildacdn.com/tild3135-3237-4235-b534-383633633836/-/contain/661x881/center/center/-/format/webp/IMG_3686.jpg.webp",
        "https://optim.tildacdn.com/tild3731-3666-4135-b565-346239313964/-/contain/661x881/center/center/-/format/webp/IMG_3670.jpg.webp",
        "https://optim.tildacdn.com/tild3139-3963-4462-b535-336530663166/-/contain/661x881/center/center/-/format/webp/IMG_3671.jpg.webp",
        "https://optim.tildacdn.com/tild3737-6630-4537-b132-363531393539/-/contain/661x881/center/center/-/format/webp/IMG_3672.jpg.webp",
        "https://optim.tildacdn.com/tild6237-3537-4533-a139-636162343130/-/contain/661x881/center/center/-/format/webp/IMG_3673.jpg.webp",
        "https://optim.tildacdn.com/tild3633-6134-4339-b962-653132663462/-/contain/661x881/center/center/-/format/webp/IMG_3675.jpg.webp",
        "https://optim.tildacdn.com/tild6238-6439-4535-b131-613730616361/-/format/webp/IMG_3676.jpg.webp",
        "https://optim.tildacdn.com/tild3462-6431-4138-a531-363230373036/-/contain/661x881/center/center/-/format/webp/IMG_3677.jpg.webp",
        "https://optim.tildacdn.com/tild3232-6431-4735-b264-323733353565/-/format/webp/WhatsApp_Image_2025-.jpeg.webp",
    ],
    10: [
        "https://optim.tildacdn.com/tild6634-3065-4264-a438-623737616663/-/format/webp/IMG_0708.jpg",
        "https://optim.tildacdn.com/tild6265-3639-4666-b530-383664353335/-/contain/661x881/center/center/-/format/webp/IMG_0709.jpg.webp",
        "https://optim.tildacdn.com/tild6364-3835-4638-a538-663237393264/-/contain/661x881/center/center/-/format/webp/IMG_0710.jpg.webp",
        "https://optim.tildacdn.com/tild3935-3965-4439-a364-333039313465/-/contain/661x881/center/center/-/format/webp/IMG_0711.jpg.webp",
        "https://optim.tildacdn.com/tild6366-6361-4166-a435-343065623531/-/contain/661x881/center/center/-/format/webp/IMG_0712.jpg.webp",
        "https://optim.tildacdn.com/tild3066-3639-4737-b164-386332343333/-/contain/661x881/center/center/-/format/webp/IMG_0713.jpg.webp",
        "https://optim.tildacdn.com/tild6664-6666-4063-b234-386138653161/-/contain/661x881/center/center/-/format/webp/IMG_0714.jpg.webp",
        "https://optim.tildacdn.com/tild3634-3231-4866-b730-373065616634/-/contain/661x881/center/center/-/format/webp/IMG_0715.jpg.webp",
        "https://optim.tildacdn.com/tild3232-6431-4735-b264-323733353565/-/format/webp/WhatsApp_Image_2025-.jpeg.webp",
    ],
    11: [
        "https://optim.tildacdn.com/tild3063-3937-4763-b761-383339613662/-/contain/673x897/center/center/-/format/webp/IMG_2914.jpg.webp",
        "https://optim.tildacdn.com/tild3139-3639-4532-b664-613564386239/-/contain/673x897/center/center/-/format/webp/IMG_2873.jpg.webp",
        "https://optim.tildacdn.com/tild3232-6431-4735-b264-323733353565/-/format/webp/WhatsApp_Image_2025-.jpeg.webp",
    ],
    12: [
        "https://optim.tildacdn.com/tild3561-6364-4530-a239-303232663335/-/resize/460x/-/format/webp/IMG_6951.JPG.webp",
        "https://optim.tildacdn.com/tild3633-3939-4337-b437-613239376538/-/resize/460x/-/format/webp/IMG_6952.JPG.webp",
        "https://optim.tildacdn.com/tild6663-6430-4134-b634-303539313965/-/resize/460x/-/format/webp/IMG_6953.JPG.webp",
        "https://optim.tildacdn.com/tild3266-3266-4530-b662-643533636631/-/resize/460x/-/format/webp/IMG_6954.JPG.webp",
        "https://optim.tildacdn.com/tild3232-6431-4735-b264-323733353565/-/format/webp/WhatsApp_Image_2025-.jpeg.webp",
    ],
    13: [
        "https://optim.tildacdn.com/tild3065-6634-4434-b035-343764626535/-/format/webp/IMG_6777.JPG.webp",
        "https://optim.tildacdn.com/tild3164-3936-4730-a533-386239333065/-/contain/997x881/center/center/-/format/webp/IMG_6958.JPG.webp",
        "https://optim.tildacdn.com/tild3232-6431-4735-b264-323733353565/-/format/webp/WhatsApp_Image_2025-.jpeg.webp",
    ],
    14: [
        "hhttps://optim.tildacdn.com/tild3666-3238-4734-b161-303439336239/-/format/webp/IMG_0815.jpg.webp",
        "https://optim.tildacdn.com/tild6561-3339-4462-a239-323030636132/-/contain/661x881/center/center/-/format/webp/IMG_0816.jpg.webp",
        "https://optim.tildacdn.com/tild3834-6135-4864-b461-306136323432/-/contain/661x881/center/center/-/format/webp/IMG_0978.jpg.webp",
        "https://optim.tildacdn.com/tild6661-3334-4832-a263-306534323063/-/contain/661x881/center/center/-/format/webp/IMG_0980.jpg.webp",
        "https://optim.tildacdn.com/tild3131-6334-4064-b731-333733366561/-/contain/661x881/center/center/-/format/webp/IMG_1298.jpg.webp",
        "https://optim.tildacdn.com/tild6430-3739-4161-b637-666362373335/-/contain/661x881/center/center/-/format/webp/IMG_1305.jpg.webp",

        "https://optim.tildacdn.com/tild6135-3363-4666-a566-623637333838/-/contain/661x881/center/center/-/format/webp/IMG_1025.jpg.webp",
        "https://optim.tildacdn.com/tild3232-6431-4735-b264-323733353565/-/format/webp/WhatsApp_Image_2025-.jpeg.webp",
    ],
};

// Функция для проверки валидности URL изображения
function isValidImageUrl(url) {
    if (!url || typeof url !== "string") return false;

    // Исключаем example.com и проверяем наличие расширений изображений
    const isNotExample = !url.includes("example.com");
    const hasImageExtension = /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i.test(
        url,
    );
    const isHttps = url.startsWith("https://");

    return (
        isNotExample &&
        (hasImageExtension || url.includes("tildacdn.com")) &&
        isHttps
    );
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

        // Фильтруем пустые строки и проверяем валидность данных
        roomsData = parsed.data.filter((room) => {
            return room && Object.keys(room).length > 1 && room.ID;
        });

        // Добавляем фотографии к каждому номеру по его ID
        roomsData = roomsData.map((room) => {
            // Приводим ID к числу для корректного сравнения
            const roomId = parseInt(room.ID);
            const photos = roomPhotos[roomId] || [];

            // Фильтруем только валидные фотографии
            const validPhotos = photos.filter(isValidImageUrl);

            return {
                ...room,
                ID: roomId, // Сохраняем ID как число
                photos: validPhotos,
                hasPhotos: validPhotos.length > 0,
            };
        });

        // Статистика по фотографиям
        const roomsWithPhotos = roomsData.filter(
            (room) => room.hasPhotos,
        ).length;

        console.log(
            `✅ Загружено ${roomsData.length} номеров из CSV файла (${roomsWithPhotos} с фотографиями)`,
        );

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

module.exports = {
    loadRoomsData,
    getRoomsData,
    getRoomPhotos,
    getRoomById,
    validateAllPhotos,
    isValidImageUrl,
};
