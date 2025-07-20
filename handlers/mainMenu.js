const mainMenuKeyboards = require("../keyboards/mainMenu");
const roomsKeyboards = require("../keyboards/rooms");
const utils = require("../utils");
const states = require("../states");
const services = {
    knowledgeBase: require("../services/knowledgeBase"),
    roomsData: require("../services/roomsData"),
    adminAnswers: require("../services/adminAnswers"),
};

module.exports = function setupMainMenuHandlers(bot, userStates) {
    // Обработка команды /start
    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        userStates.set(userId, states.MAIN_MENU);

        const welcomeMessage = `👋 Здравствуйте! Добро пожаловать на базу отдыха "Золотые Пески" оз. Тургояк 🌲🏡

Меня зовут Юлия, я с радостью помогу вам с подбором размещения.

📍 Перед тем, как мы продолжим, прочтите важную информацию по соответствующей кнопке!

Выберите один из вариантов или задайте вопрос в чате:`;

        await utils.safeSendMessage(bot, chatId, welcomeMessage, {
            parse_mode: "Markdown",
            ...mainMenuKeyboards.getMainMenuKeyboard(),
        });

        if (await utils.isAdmin(bot, userId)) {
            await utils.safeSendMessage(
                bot,
                chatId,
                "🔧 Панель администратора доступна",
                {
                    parse_mode: "Markdown",
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: "⚙️ Админ-панель",
                                    callback_data: "admin_panel",
                                },
                            ],
                        ],
                    },
                },
            );
        }
    });

    // Обработка команды меню
    bot.onText(/меню|menu/i, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        userStates.set(userId, states.MAIN_MENU);
        await utils.safeSendMessage(
            bot,
            chatId,
            "Главное меню:",
            mainMenuKeyboards.getMainMenuKeyboard(),
        );
    });

    // Обработка callback запросов главного меню
    bot.on("callback_query", async (callbackQuery) => {
        const msg = callbackQuery.message;
        const chatId = msg.chat.id;
        const userId = callbackQuery.from.id;
        const data = callbackQuery.data;

        try {
            try {
                await bot.answerCallbackQuery(callbackQuery.id);
            } catch (error) {
                console.error(
                    "Ошибка при ответе на callback query:",
                    error.message,
                );
            }

            switch (data) {
                case "important_info":
                    await handleImportantInfo(bot, chatId);
                    break;

                case "rooms":
                    const roomsData = services.roomsData.getRoomsData();
                    console.log(
                        "Отображение номеров. Количество:",
                        roomsData.length,
                    );
                    console.log(
                        "Первый номер:",
                        JSON.stringify(roomsData[0], null, 2),
                    );
                    await utils.safeSendMessage(
                        bot,
                        chatId,
                        "Выберите номер:",
                        roomsKeyboards.getRoomsKeyboard(roomsData),
                    );
                    break;

                case "entertainment":
                    await handleEntertainment(bot, chatId);
                    break;

                case "facilities":
                    await handleFacilities(bot, chatId);
                    break;

                case "camping":
                    await handleCamping(bot, chatId); // ✅ Правильно
                    break;

                case "our_beach":
                    await handleOur_beach(bot, chatId); // ✅ Правильно
                    break;

                case "Mangalchik":
                    await handleMangalchik(bot, chatId); // ✅ Правильно
                    break;

                case "directions":
                    await handleDirections(bot, chatId);
                    break;

                case "booking":
                    userStates.set(userId, states.BOOKING_PROCESS);
                    await utils.safeSendMessage(
                        bot,
                        chatId,
                        "Были ли вы у нас?",
                        mainMenuKeyboards.getBookingKeyboard(),
                    );
                    break;

                case "back_to_menu":
                    userStates.set(userId, states.MAIN_MENU);
                    await utils.safeSendMessage(
                        bot,
                        chatId,
                        "Выберите команду из меню или задайте вопрос в чате:",
                        mainMenuKeyboards.getMainMenuKeyboard(),
                    );
                    break;

                case "booking_yes":
                    await handleBookingYes(bot, chatId);
                    break;

                case "booking_no":
                    await handleBookingNo(bot, chatId);
                    break;

                default:
                    if (data.startsWith("room_")) {
                        await handleRoomDetails(bot, chatId, data);
                    }
                    break;
            }
        } catch (error) {
            console.error(
                "Ошибка в обработчике callback query:",
                error.message,
            );
            try {
                await bot.answerCallbackQuery(callbackQuery.id);
            } catch (answerError) {
                console.error(
                    "Не удалось ответить на callback query:",
                    answerError.message,
                );
            }
        }
    });

    async function handleImportantInfo(bot, chatId) {
        try {
            // Сначала отправляем документ
            await bot.sendDocument(
                chatId,
                "./Правила проживания и отдыха.docx.pdf",
                {
                    caption: "Прошу ознакомиться с правилами проживания",
                },
            );

            // Потом отправляем фото с основным текстом и клавиатурой
            await bot.sendPhoto(
                chatId,
                "content/importantinfo/Important1.png.webp",
                {
                    caption: `📌 Наша база расположена на берегу озера в заповедной зоне.
    💧 В целях сохранения экологии:
    • Центральная канализация и водопровод отсутствуют
    • Душа нет, но есть прекрасные русские бани на дровах (как для помывки, так и для отдыха)
    • Удобства на улице
    🧻 Большой дачный туалет на территории
    🦟 *Противоклещевая обработка:*

Территория базы обрабатывается от клещей.  
Однако мы *рекомендуем взять с собой защитные аэрозоли* для дополнительной безопасности.

💰 Скидки и предложения:  
• Скидки постоянным клиентам при повторном бронировании  
• Длительное проживание (от 5 дней) - баня в подарок один раз и бесплатная парковка.
• Уточняйте актуальные предложения при бронировании  
Какие либо льготы для конкретных групп людей не предусмотрены. 
    
    Если такие условия вас устраивают, давайте расскажу подробнее 😊
    
    Выберите команду из меню или задайте вопрос в чате:`,
                    parse_mode: "Markdown",
                    ...mainMenuKeyboards.getBackToMenuKeyboard(),
                },
            );
        } catch (error) {
            console.error(
                "Ошибка при отправке медиа в handleImportantInfo:",
                error,
            );
            // В случае ошибки с медиа, отправляем только текст
            await utils.safeSendMessage(
                bot,
                chatId,
                `📌 Наша база расположена на берегу озера в заповедной зоне.
    💧 В целях сохранения экологии:
    • Центральная канализация и водопровод отсутствуют
    • Душа нет, но есть прекрасные русские бани на дровах (как для помывки, так и для отдыха)
    • Удобства на улице
    🧻 Большой дачный туалет на территории
    👶 Дети до 5 лет — бесплатно (если без отдельного спального места)
    Если такие условия вас устраивают, давайте расскажу подробнее 😊
    Выберите команду из меню или задайте вопрос в чате:
    Произошла ошибка при загрузке дополнительных материалов.`,
                {
                    parse_mode: "Markdown",
                    ...mainMenuKeyboards.getBackToMenuKeyboard(),
                },
            );
        }
    }

    async function handleCamping(bot, chatId) {
        // Массив с URL фотографий
        const photos = [
            "content/camping/1.webp",
            "content/camping/2.webp",
            "content/camping/3.webp",
            "content/camping/4.webp",
            "content/camping/6.webp",
            "content/camping/7.jfif",
            "content/camping/8.jfif",
            "content/camping/9.png",
        ];

        const message = `Размещение с палатками:
            у нас есть отдельная зона кемпинга, где можно размещаться со своей палаткой. Эта территория — продолжение базы, но палатки на участке с домиками не размещаются.
        📍 *Расположение:*  
        На самом берегу озера Тургояк, с выходом на бухту, шикарным песчаным пляжем и видом на остров Веры.  
        🔹 Заезд: 50 м от красных ворот — поворот налево по синему указателю «Кемпинг Золотые пески».
        🚗 *Парковка:*  
        — Машины рядом с палатками ставить нельзя (береговая зона)  
        — Автомобиль будет в 30–50 м  
        — Хотите ближе? Ставьте палатку ближе к парковке
        🔥 *Что есть на территории:*  
        — Костровище  
        — Освещение  
        — Туалет дачного типа  
        — Столы (по мере занятости, лучше привозить свои)  
        🚫 Умывальников нет (нет водоснабжения)  
        🧖‍♂ *Есть две отличные русские бани на дровах!*
        💰 *Стоимость:*  
        — От 1000 до 1500 ₽ в сутки за палатку или шатёр  
        — Цена зависит от сезона и дня недели  
        — Размер палатки не влияет на цену  
        — Учитываем только *кол-во ночей*  
        — Шатёр = палатка  
        — *Бронирование* — только для групп от 8–10 палаток. Остальные выбирают место на месте с администратором.
        🏖 Гости кемпинга могут пользоваться нашим *основным песчаным пляжем* — одним из лучших на всём озере!
        *Будем рады видеть вас у воды! 🌊*
        
        📍 *Как добраться:*
        От главного поворота на нашу базу , проехать еще 100 метров и повернуть налево, перед вывеской синено цвета (последние 2 фото)
        Координаты 55.186718, 60.055969
        [https://yandex.ru/maps/?ll=60.057310%2C55.186488&mode=routes&rtext=~55.186718%2C60.055969&rtt=auto&ruri=~&source=serp_navig&z=19]`;

        // Отправляем медиа-группу с фотографиями без текста
        try {
            await bot.sendMediaGroup(
                chatId,
                photos.map((photo) => ({
                    type: "photo",
                    media: photo,
                })),
            );

            // Отправляем текст отдельным сообщением
            await utils.safeSendMessage(bot, chatId, message, {
                parse_mode: "Markdown",
                ...mainMenuKeyboards.getBackToMenuKeyboard(),
            });
        } catch (error) {
            console.error("Ошибка при отправке медиа-группы:", error);
            // Если не получилось отправить медиа-группу, отправляем обычное текстовое сообщение
            await utils.safeSendMessage(bot, chatId, message, {
                parse_mode: "Markdown",
                ...mainMenuKeyboards.getBackToMenuKeyboard(),
            });
        }
    }

    async function handleOur_beach(bot, chatId) {
        // Массив с URL фотографий
        const photos = ["content/beach/1.jfif", "content/beach/2.jfif"];

        const message = `🏖🌞 *Дневное пребывание и посещение пляжа*
    🚗 *Парковка для гостей* — 1000 ₽ без ограничения по времени.
    📍 Вы можете находиться на территории и пользоваться пляжем, используя свои покрывала и полотенца.
    🪑 *Использование своих стульев, кресел, шезлонгов* — 200 ₽ с единицы.
    🛋 *Аренда наших шезлонгов* — 500 ₽ в день.
    ✅ Если вы припарковались на нашей платной парковке, плата за использование своих кресел не взимается.
    🐕 *Посещение с собаками любого размера* — 1000 ₽ с человека, обязательно использовать поводок и намордник (для больших собак), даже если собака очень добрая и милая!
    ‼️ *Установка своих мангалов, столов и другого оборудования на территории пляжа ЗАПРЕЩЕНА!*  
    🔥 *Хотите пожарить шашлыки? Арендуйте мангальную зону!*`;

        // Отправляем медиа-группу с фотографиями без текста
        try {
            await bot.sendMediaGroup(
                chatId,
                photos.map((photo) => ({
                    type: "photo",
                    media: photo,
                })),
            );

            // Отправляем текст отдельным сообщением
            await utils.safeSendMessage(bot, chatId, message, {
                parse_mode: "Markdown",
                ...mainMenuKeyboards.getBackToMenuKeyboard(),
            });
        } catch (error) {
            console.error("Ошибка при отправке медиа-группы:", error);
            // Если не получилось отправить медиа-группу, отправляем обычное текстовое сообщение
            await utils.safeSendMessage(bot, chatId, message, {
                parse_mode: "Markdown",
                ...mainMenuKeyboards.getBackToMenuKeyboard(),
            });
        }
    }

    async function handleEntertainment(bot, chatId) {
        // Массив с URL фотографий
        const photos = [
            "content/Entertaiment/1.webp",
            "content/Entertaiment/2.webp",
            "content/Entertaiment/3.webp",
            "content/Entertaiment/4.webp",
            "content/Entertaiment/5.webp",
            "content/Entertaiment/6.webp",
        ];

        const message = `🏖 Развлечения:
    1. Купание в озере
    2. Русская баня с парением ❄️:
        - Баня русская на дровах. Большая, от 8 до 30 человек. Вместительность высокая. Мангальная зона и мангал перед баней  Большая парилка, моечное отделение, большой предбанник с большим столом и скамейками - Стоимость 2500 час, бронирование от трех часов.
        - Баня русская на дровах. Малая - максимальная вместительность 6 человек. Стоимость 2000 час от 1.5 часов. 
      📍Посещение по обязательной предварительной брони, за четыре часа большую и за два малую. 
      📍Бани находятся в 25 метрах от озера. 
    3. Прокат:
        - Сапборд — 1200₽/час, 3000₽ на 3 часа
        - Байдарка (3 чел.) - 1500₽/час, 3500₽ на 3 часа
        - Лодка двухместная надувная - 1500₽/час, 3500₽ на 3 часа
        - Лодка надувная четырехместная - 1500₽/час, 3500₽ на 3 часа
      📍 Спасательные жилеты включены в стоимость!
      📍 Плавсредства выдаются под обеспечительный залог!
    4. Волейбольная площадка 
    5.	Йога на открытом воздухе, с поющими чашами для гостей каждую среду, субботу и воскресенье в 9.00 при условии хорошей погоды.
    6. 🍖 *Аренда мангальной зоны*
        У нас есть мангальные зоны прямо на берегу — большие столы со скамейками и мангалом. Зоны открытые (не крытые), отлично подходят для пикника у воды.
        💰 *Стоимость аренды:*  
        — *Выходные:* 2500 ₽ за 3 часа  
        — *Продление:* 500 ₽ за каждый дополнительный час  
        — *Будние дни:* 2500 ₽ за весь день
        🚗 *Парковка оплачивается отдельно* — 500 ₽ в сутки.
        При бронировании номера мангальная зона входит в стоимость номера.
        Мангальная зона — отличное место для отдыха с друзьями и семьёй у самого берега озера! 🌅
        Остались вопросы? Выберите команду из меню или задайте вопрос в чате:`;

        // Отправляем медиа-группу с фотографиями без текста
        try {
            await bot.sendMediaGroup(
                chatId,
                photos.map((photo) => ({
                    type: "photo",
                    media: photo,
                })),
            );

            // Отправляем текст отдельным сообщением
            await utils.safeSendMessage(bot, chatId, message, {
                parse_mode: "Markdown",
                ...mainMenuKeyboards.getBackToMenuKeyboard(),
            });
        } catch (error) {
            console.error("Ошибка при отправке медиа-группы:", error);
            // Если не получилось отправить медиа-группу, отправляем обычное текстовое сообщение
            await utils.safeSendMessage(bot, chatId, message, {
                parse_mode: "Markdown",
                ...mainMenuKeyboards.getBackToMenuKeyboard(),
            });
        }
    }

    async function handleFacilities(bot, chatId) {
        await utils.safeSendMessage(
            bot,
            chatId,
            `🍽️ Удобства:
• Общая кухня с газовыми плитами
• Парковка:
  - Легковой авто — 500₽/сутки
  - Газель — 1000₽/сутки
• Чистейшая родниковая вода из озера
• Запас питьевой воды, решётки и угли — берите с собой

Остались вопросы? Выберите команду из меню или задайте вопрос в чате:`,
            {
                parse_mode: "Markdown",
                ...mainMenuKeyboards.getBackToMenuKeyboard(),
            },
        );
    }
    async function handleMangalchik(bot, chatId) {
        // Массив с URL фотографий
        const photos = ["content/mangalchik/1.png", "content/mangalchik/2.png"];

        const message = `🍖 *Аренда мангальной зоны*  
У нас есть мангальные зоны прямо на берегу — большие столы со скамейками и мангалом. Зоны открытые (не крытые), отлично подходят для пикника у воды.  
💰 *Стоимость аренды:*  
— *Выходные:* 2500 ₽ за 3 часа  
— *Продление:* 500 ₽ за каждый дополнительный час  
— *Будние дни:* 2500 ₽ за весь день  
🚗 *Парковка оплачивается отдельно* — 500 ₽ в сутки.  
Мангальная зона — отличное место для отдыха с друзьями и семьёй у самого берега озера! 🌅  
‼️ *Установка своих мангалов, столов и другого оборудования на территории пляжа ЗАПРЕЩЕНА!*  
🔥 *Хотите пожарить шашлыки? Арендуйте мангальную зону!*

Остались вопросы? Выберите команду из меню или задайте вопрос в чате:`;

        // Отправляем медиа-группу с фотографиями без текста
        try {
            await bot.sendMediaGroup(
                chatId,
                photos.map((photo) => ({
                    type: "photo",
                    media: photo,
                })),
            );

            // Отправляем текст отдельным сообщением
            await utils.safeSendMessage(bot, chatId, message, {
                parse_mode: "Markdown",
                ...mainMenuKeyboards.getBackToMenuKeyboard(),
            });
        } catch (error) {
            console.error("Ошибка при отправке медиа-группы:", error);
            // Если не получилось отправить медиа-группу, отправляем обычное текстовое сообщение
            await utils.safeSendMessage(bot, chatId, message, {
                parse_mode: "Markdown",
                ...mainMenuKeyboards.getBackToMenuKeyboard(),
            });
        }
    }
    
    async function handleDirections(bot, chatId) {
        const photos = [
            "content/road/Маршрут.png",
            "content/road/50c10319-d3d4-4488-bccf-58b2f16b00df.jfif",
            "content/road/d6f84703-8cba-4217-a3ca-b42d2da16d27.jfif",
        ];

        const message = `
        📍 Координаты: 
            55.1881079369311, 60.05969764417703
            [https://yandex.ru/maps/?ll=60.061851%2C55.187183&mode=routes&rtext=~55.187969%2C60.059069&rtt=auto&ruri=~ymapsbm1%3A%2F%2Forg%3Foid%3D109014041624&source=serp_navig&z=15.3]

        🚙 Возможен заезд на автомобиле, парковка платная.

        *Остались вопросы? Выберите команду из меню или задайте вопрос в чате:*`;

        try {
            await bot.sendMediaGroup(
                chatId,
                photos.map((photo) => ({
                    type: "photo",
                    media: photo,
                })),
            );

            // Отправляем текст отдельным сообщением
            await utils.safeSendMessage(bot, chatId, message, {
                parse_mode: "Markdown",
                ...mainMenuKeyboards.getBackToMenuKeyboard(),
            });
        } catch (error) {
            console.error("Ошибка при отправке медиа-группы:", error);
            // Если не получилось отправить медиа-группу, отправляем обычное текстовое сообщение
            await utils.safeSendMessage(bot, chatId, message, {
                parse_mode: "Markdown",
                ...mainMenuKeyboards.getBackToMenuKeyboard(),
            });
        }
    }

    async function handleBookingYes(bot, chatId) {
        await utils.safeSendMessage(
            bot,
            chatId,
            `🛏️ Бронирование для постоянных клиентов

Перейдите по ссылке для быстрого бронирования:
[Забронировать номер](https://script.google.com/macros/s/AKfycbywmbK6PsGIqGEJQGEK2ix-IQXPG0TNSBXNr-19QODCRxDXWv-ntNllrh5O6X-amWwV/exec)

Или напишите менеджеру прямо в этом чате!`,
            {
                parse_mode: "Markdown",
                ...mainMenuKeyboards.getBackToMenuKeyboard(),
            },
        );
    }

    async function handleBookingNo(bot, chatId) {
        await utils.safeSendMessage(
            bot,
            chatId,
            `📌 Наша база расположена на берегу озера в заповедной зоне.

💧 В целях сохранения экологии:
• Центральная канализация и водопровод отсутcтвуют
• Душа нет, но есть прекрасные русские бани на дровах (как для помывки, так и для отдыха)
• Удобства на улице

🧻 Большой дачный туалет на территории
👶 Дети до 5 лет — бесплатно (если без отдельного спального места)

Если такие условия вас устраивают, перейдите к бронированию:
[Забронировать номер](https://your-booking-link.com)

Или напишите менеджеру прямо в этом чате для подбора подходящего варианта!

Остались вопросы? Выберите команду из меню или задайте вопрос в чате:`,
            {
                parse_mode: "Markdown",
                ...mainMenuKeyboards.getBackToMenuKeyboard(),
            },
        );
    }

    async function handleRoomDetails(bot, chatId, data) {
        const roomIndex = parseInt(data.split("_")[1]);
        const roomsData = services.roomsData.getRoomsData();
        const room = roomsData[roomIndex];
        if (room) {
            console.log(`📸 Показ номера ${room.ID || roomIndex}:`, room);
            // Формируем описание номера
            let roomInfo = `🏠 ${room.Название || "Номер без названия"}\n\n`;
            if (room.Описание) roomInfo += `📝 ${room.Описание}\n\n`;
            if (room.Тип) roomInfo += `🏷️ Объект аренды: ${room.Тип}\n`;
            if (room.Комнат) roomInfo += `🏠 Комнат: ${room.Комнат}\n`;
            if (room.Вместимость)
                roomInfo += `👥 Вместимость: ${room.Вместимость} чел. в комнате\n`;
            if (room.Цена) roomInfo += `💰 Цена: от ${room.Цена}₽\n`;
            if (room.Удобства) roomInfo += `🛏️ Удобства: ${room.Удобства}\n`;
            if (room.Входит)
                roomInfo += `ℹ️ В размещение входит: ${room.Входит}\n`;

            // Добавляем фразу о вопросах
            roomInfo += `\n❓ Остались вопросы? Выберите команду из меню или задайте вопрос в чате:`;

            // Получаем фотографии
            let photos = room.photos || [];
            if (photos.length === 0) {
                // Попробуем получить фотографии по ID номера
                const roomPhotos = services.roomsData.getRoomPhotos(room.ID);
                if (roomPhotos && roomPhotos.length > 0) {
                    photos = roomPhotos;
                }
            }

            if (photos && photos.length > 0) {
                console.log(
                    `✅ Отправляем ${photos.length} фотографий для номера ${room.ID || roomIndex}`,
                );

                try {
                    if (photos.length === 1) {
                        // Если одна фотография, отправляем как обычное фото с подписью
                        await bot.sendPhoto(chatId, photos[0], {
                            caption: roomInfo,
                            parse_mode: "Markdown",
                            reply_markup:
                                roomsKeyboards.getRoomDetailsKeyboard()
                                    .reply_markup,
                        });
                    } else {
                        // Если несколько фотографий, используем media group
                        const mediaGroup = photos.map((photo, index) => ({
                            type: "photo",
                            media: photo,
                            // Добавляем описание только к первой фотографии
                            caption: index === 0 ? roomInfo : undefined,
                            parse_mode: index === 0 ? "Markdown" : undefined,
                        }));

                        await bot.sendMediaGroup(chatId, mediaGroup);

                        // Отправляем кнопки отдельным сообщением после медиагруппы
                        await utils.safeSendMessage(
                            bot,
                            chatId,
                            "Выберите действие:",
                            {
                                ...roomsKeyboards.getRoomDetailsKeyboard(),
                            },
                        );
                    }
                } catch (error) {
                    console.error(
                        `❌ Ошибка отправки медиагруппы:`,
                        error.message,
                    );

                    // Если не удалось отправить медиагруппу, отправляем по старому методу
                    for (let i = 0; i < photos.length; i++) {
                        const photoUrl = photos[i];
                        try {
                            console.log(
                                `📷 Отправка фотографии ${i + 1}/${photos.length}: ${photoUrl}`,
                            );

                            if (i === 0) {
                                // К первой фотографии добавляем описание
                                await bot.sendPhoto(chatId, photoUrl, {
                                    caption: roomInfo,
                                    parse_mode: "Markdown",
                                });
                            } else {
                                await bot.sendPhoto(chatId, photoUrl);
                            }

                            // Небольшая задержка между отправкой фотографий
                            if (i < photos.length - 1) {
                                await new Promise((resolve) =>
                                    setTimeout(resolve, 500),
                                );
                            }
                        } catch (photoError) {
                            console.error(
                                `❌ Ошибка отправки фотографии ${photoUrl}:`,
                                photoError.message,
                            );
                            await utils.safeSendMessage(
                                bot,
                                chatId,
                                `📷 Фотография: ${photoUrl}`,
                            );
                        }
                    }

                    // Отправляем кнопки
                    await utils.safeSendMessage(
                        bot,
                        chatId,
                        "Выберите действие:",
                        {
                            ...roomsKeyboards.getRoomDetailsKeyboard(),
                        },
                    );
                }
            } else {
                console.log(
                    `⚠️ Фотографии для номера ${room.ID || roomIndex} не найдены`,
                );

                // Если фотографий нет, отправляем только описание
                await utils.safeSendMessage(bot, chatId, roomInfo, {
                    parse_mode: "Markdown",
                    ...roomsKeyboards.getRoomDetailsKeyboard(),
                });
            }
        } else {
            console.log(`❌ Номер с индексом ${roomIndex} не найден`);
            await utils.safeSendMessage(
                bot,
                chatId,
                "Информация о номере не найдена",
                {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: "🔙 К списку номеров",
                                    callback_data: "rooms",
                                },
                            ],
                        ],
                    },
                },
            );
        }
    }
};
