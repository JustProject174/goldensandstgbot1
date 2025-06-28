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

📍 Перед тем, как мы продолжим, обратите внимание на важную информацию:

Выберите один из вариантов или задайте вопрос в чате:`;

        await utils.safeSendMessage(bot, chatId, welcomeMessage, {
            parse_mode: "Markdown",
            ...mainMenuKeyboards.getMainMenuKeyboard(),
        });

        if (utils.isAdmin(userId)) {
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
            await bot.answerCallbackQuery(callbackQuery.id);
        } catch (error) {
            console.error("Ошибка ответа на callback:", error.message);
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
                    "Главное меню:",
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
    });

    async function handleImportantInfo(bot, chatId) {
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

Если такие условия вас устраивают, давайте расскажу подробнее 😊`,
            {
                parse_mode: "Markdown",
                ...mainMenuKeyboards.getBackToMenuKeyboard(),
            },
        );
    }

    async function handleRooms(bot, chatId) {
        const roomsData = services.roomsData.getRoomsData();

        await utils.safeSendMessage(
            bot,
            chatId,
            `🏠 КОМФОРТ
• Включено: постельное белье, посуда, кухня, мангал
• Без душа и туалета в домах (есть бани и удобства на улице)
• Примеры:
  - Дом №8 (4 чел.) — от 9999₽
  - Дом №9/10 (6 чел.) — от 10999₽
  - Дом №14 (до 10+ чел.) — от 21999₽

🛏️ ЭКОНОМ
• 4 или 5 односпальных кроватей
• Без постельного белья и посуды (можно взять с собой или арендовать: 200₽/комплект)
• Холодильник — уточняйте по каждой комнате
• Общая кухня на территории
• Примеры:
  - Комната в даче 1,2,4,11,13 (4 чел.) — от 4999₽
  - Комната в даче 6 (5 чел.) — от 5499₽

Выберите номер для подробной информации:`,
            {
                parse_mode: "Markdown",
                ...roomsKeyboards.getRoomsKeyboard(roomsData),
            },
        );
    }

    async function handleEntertainment(bot, chatId) {
        await utils.safeSendMessage(
            bot,
            chatId,
            `🏖 На территории:
• Купание в озере
• Русская баня с парением и нырянием ❄️
• Прокат:
  - Сапборд — 1200₽/час
  - Байдарка
  - Лодка

🍢 Большие мангальные зоны с лавками и столами включены в стоимость!`,
            {
                parse_mode: "Markdown",
                ...mainMenuKeyboards.getBackToMenuKeyboard(),
            },
        );
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
• Запас питьевой воды, решётки и угли — берите с собой`,
            {
                parse_mode: "Markdown",
                ...mainMenuKeyboards.getBackToMenuKeyboard(),
            },
        );
    }

    async function handleDirections(bot, chatId) {
        await utils.safeSendMessage(
            bot,
            chatId,
            `📍 Координаты: 55.1881079369311, 60.05969764417703.
https://yandex.ru/maps/?ll=60.061851%2C55.187183&mode=routes&rtext=~55.187969%2C60.059069&rtt=auto&ruri=~ymapsbm1%3A%2F%2Forg%3Foid%3D109014041624&source=serp_navig&z=15.3

🚙 Возможен заезд на автомобиле, парковка платная.
🚖 Трансфер:
• Индивидуальный трансфер - уточняйте стоимость
• Групповой трансфер - уточняйте стоимость

Для заказа трансфера напишите "трансфер"`,
            {
                parse_mode: "Markdown",
                ...mainMenuKeyboards.getBackToMenuKeyboard(),
            },
        );
    }

    async function handleBookingYes(bot, chatId) {
        await utils.safeSendMessage(
            bot,
            chatId,
            `🛏️ Бронирование для постоянных клиентов

Перейдите по ссылке для быстрого бронирования:
[Забронировать номер](https://your-booking-link.com)

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
• Центральная канализация и водопровод отсутствуют
• Душа нет, но есть прекрасные русские бани на дровах (как для помывки, так и для отдыха)
• Удобства на улице

🧻 Большой дачный туалет на территории
👶 Дети до 5 лет — бесплатно (если без отдельного спального места)

Если такие условия вас устраивают, перейдите к бронированию:
[Забронировать номер](https://your-booking-link.com)

Или напишите менеджеру прямо в этом чате для подбора подходящего варианта!`,
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
            if (room.Вместимость)
                roomInfo += `👥 Вместимость: ${room.Вместимость} чел.\n`;
            if (room.Цена) roomInfo += `💰 Цена: от ${room.Цена}₽\n`;
            if (room.Тип) roomInfo += `🏷️ Тип: ${room.Тип}\n`;
            if (room.Удобства) roomInfo += `🛏️ Удобства: ${room.Удобства}\n`;
            if (room.Дополнительно)
                roomInfo += `ℹ️ Дополнительно: ${room.Дополнительно}\n`;

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

