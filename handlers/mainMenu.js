const mainMenuKeyboards = require("../keyboards/mainMenu");
const roomsKeyboards = require("../keyboards/rooms");
const utils = require("../utils");
const states = require("../states");
const bookingModule = require("../services/bookingModule");
const { getBookingSession, saveBookingSession, deleteBookingSession } = require("../services/supabase");
const logger = require("../logger");
const services = {
    knowledgeBase: require("../services/knowledgeBase"),
    roomsData: require("../services/roomsData"),
    adminAnswers: require("../services/adminAnswers"),
};

module.exports = function setupMainMenuHandlers(bot, userStates) {
    // Вспомогательные функции
    function parseDate(dateStr) {
        const match = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/) ||
                     dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (!match) return null;
        const [, day, month, year] = match;
        const date = new Date(`${year}-${month}-${day}`);
        return isNaN(date) ? null : date;
    }

    function formatDateForDisplay(date) {
        const d = new Date(date);
        return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
    }

    function formatDateForGAS(date) {
        const d = new Date(date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function calculateTotalPrice(pricePerDay, checkIn, checkOut) {
        const nights = Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24));
        let total = 0;
        let currentDate = new Date(checkIn);
        while (currentDate < new Date(checkOut)) {
            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
            const day = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][currentDate.getDay()];
            const key = `${month}${day}`;
            total += pricePerDay[key] || 0;
            currentDate.setDate(currentDate.getDate() + 1);
        }
        return total;
    }

    // Обработка текстовых сообщений для бронирования
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const text = msg.text;

        // Игнорировать команды
        if (text.startsWith('/')) return;

        // Проверяем, находится ли пользователь в процессе бронирования
        if (userStates.get(userId) !== states.BOOKING_PROCESS) return;

        try {
            logger.info(`Processing message for user ${userId} in chat ${chatId}: ${text}`);
            const { data: session, error } = await getBookingSession(chatId);
            if (error || !session) {
                logger.error(`Booking session not found for chat ${chatId}`, { error });
                await utils.safeSendMessage(bot, chatId, '❌ Сессия бронирования не найдена. Начните заново.', {
                    parse_mode: 'Markdown',
                    ...mainMenuKeyboards.getBackToMenuKeyboard()
                });
                userStates.set(userId, states.MAIN_MENU);
                return;
            }

            // Проверка времени жизни сессии (24 часа)
            if (new Date(session.updated_at) < new Date(Date.now() - 24 * 60 * 60 * 1000)) {
                logger.warn(`Booking session expired for chat ${chatId}`);
                await deleteBookingSession(chatId);
                await utils.safeSendMessage(bot, chatId, '❌ Сессия бронирования истекла. Начните заново.', {
                    parse_mode: 'Markdown',
                    ...mainMenuKeyboards.getBackToMenuKeyboard()
                });
                userStates.set(userId, states.MAIN_MENU);
                return;
            }

            let bookingData = session.data || {};

            if (session.step === 'checkIn') {
                const checkIn = parseDate(text);
                if (!checkIn) {
                    logger.warn(`Invalid check-in date format for chat ${chatId}: ${text}`);
                    await utils.safeSendMessage(bot, chatId, '❌ Неверный формат даты. Введите дату заезда (ДД.ММ.ГГГГ):', {
                        parse_mode: 'Markdown',
                        ...mainMenuKeyboards.getBackToMenuKeyboard()
                    });
                    return;
                }
                if (checkIn < new Date().setHours(0, 0, 0, 0)) {
                    logger.warn(`Check-in date in the past for chat ${chatId}: ${text}`);
                    await utils.safeSendMessage(bot, chatId, '❌ Дата заезда не может быть в прошлом.', {
                        parse_mode: 'Markdown',
                        ...mainMenuKeyboards.getBackToMenuKeyboard()
                    });
                    return;
                }
                bookingData.checkIn = formatDateForGAS(checkIn);
                await saveBookingSession(chatId, 'checkOut', bookingData);
                logger.info(`Check-in date saved for chat ${chatId}: ${bookingData.checkIn}`);
                await utils.safeSendMessage(bot, chatId, '📅 Введите дату выезда (в формате ДД.ММ.ГГГГ):', {
                    parse_mode: 'Markdown',
                    ...mainMenuKeyboards.getBackToMenuKeyboard()
                });
            } else if (session.step === 'checkOut') {
                const checkOut = parseDate(text);
                if (!checkOut || checkOut <= new Date(bookingData.checkIn)) {
                    logger.warn(`Invalid check-out date for chat ${chatId}: ${text}`);
                    await utils.safeSendMessage(bot, chatId, '❌ Неверная дата выезда. Введите дату позже заезда (ДД.ММ.ГГГГ):', {
                        parse_mode: 'Markdown',
                        ...mainMenuKeyboards.getBackToMenuKeyboard()
                    });
                    return;
                }
                bookingData.checkOut = formatDateForGAS(checkOut);

                const rooms = await bookingModule.getAvailableRooms(bookingData.checkIn, bookingData.checkOut);
                if (!rooms || rooms.length === 0) {
                    logger.warn(`No available rooms for dates ${bookingData.checkIn} to ${bookingData.checkOut} for chat ${chatId}`);
                    await utils.safeSendMessage(bot, chatId, '❌ Нет доступных номеров на указанные даты.', {
                        parse_mode: 'Markdown',
                        ...mainMenuKeyboards.getBackToMenuKeyboard()
                    });
                    await deleteBookingSession(chatId);
                    userStates.set(userId, states.MAIN_MENU);
                    return;
                }

                // Фильтрация номеров через services.roomsData
                const localRooms = services.roomsData.getRoomsData();
                const filteredRooms = rooms.filter(googleRoom =>
                    localRooms.some(localRoom => localRoom.ID === googleRoom.id)
                );

                if (filteredRooms.length === 0) {
                    logger.warn(`No matching rooms in local data for chat ${chatId}`);
                    await utils.safeSendMessage(bot, chatId, '❌ Нет доступных номеров, соответствующих нашей базе данных.', {
                        parse_mode: 'Markdown',
                        ...mainMenuKeyboards.getBackToMenuKeyboard()
                    });
                    await deleteBookingSession(chatId);
                    userStates.set(userId, states.MAIN_MENU);
                    return;
                }

                let roomList = '🏠 Доступные номера:\n';
                filteredRooms.forEach((room, index) => {
                    const localRoom = localRooms.find(lr => lr.ID === room.id);
                    roomList += `${index + 1}. ${mainMenuKeyboards.escapeHtml(room.name)} (${room.type}, вместимость: ${room.capacity}${localRoom && localRoom.Цена ? `, цена от ${localRoom.Цена} ₽/ночь` : ''})\n`;
                });
                roomList += '\nВыберите номер (введите номер из списка):';

                bookingData.rooms = filteredRooms;
                await saveBookingSession(chatId, 'roomSelection', bookingData);
                logger.info(`Available rooms sent to chat ${chatId}, count: ${filteredRooms.length}`);
                await utils.safeSendMessage(bot, chatId, roomList, {
                    parse_mode: 'Markdown',
                    ...mainMenuKeyboards.getBackToMenuKeyboard()
                });
            } else if (session.step === 'roomSelection') {
                const roomIndex = parseInt(text) - 1;
                if (isNaN(roomIndex) || roomIndex < 0 || roomIndex >= bookingData.rooms.length) {
                    logger.warn(`Invalid room selection for chat ${chatId}: ${text}`);
                    await utils.safeSendMessage(bot, chatId, '❌ Неверный номер. Выберите номер из списка:', {
                        parse_mode: 'Markdown',
                        ...mainMenuKeyboards.getBackToMenuKeyboard()
                    });
                    return;
                }
                bookingData.roomId = bookingData.rooms[roomIndex].id;
                await saveBookingSession(chatId, 'guestName', bookingData);
                logger.info(`Room selected for chat ${chatId}: roomId ${bookingData.roomId}`);
                await utils.safeSendMessage(bot, chatId, '👤 Введите ваше имя:', {
                    parse_mode: 'Markdown',
                    ...mainMenuKeyboards.getBackToMenuKeyboard()
                });
            } else if (session.step === 'guestName') {
                bookingData.guestName = text.trim();
                if (!bookingData.guestName) {
                    logger.warn(`Empty guest name for chat ${chatId}`);
                    await utils.safeSendMessage(bot, chatId, '❌ Имя не может быть пустым. Введите ваше имя:', {
                        parse_mode: 'Markdown',
                        ...mainMenuKeyboards.getBackToMenuKeyboard()
                    });
                    return;
                }
                await saveBookingSession(chatId, 'guestEmail', bookingData);
                logger.info(`Guest name saved for chat ${chatId}: ${bookingData.guestName}`);
                await utils.safeSendMessage(bot, chatId, '📧 Введите ваш email:', {
                    parse_mode: 'Markdown',
                    ...mainMenuKeyboards.getBackToMenuKeyboard()
                });
            } else if (session.step === 'guestEmail') {
                if (!isValidEmail(text)) {
                    logger.warn(`Invalid email format for chat ${chatId}: ${text}`);
                    await utils.safeSendMessage(bot, chatId, '❌ Неверный формат email. Попробуйте снова:', {
                        parse_mode: 'Markdown',
                        ...mainMenuKeyboards.getBackToMenuKeyboard()
                    });
                    return;
                }
                bookingData.guestEmail = text.trim();
                await saveBookingSession(chatId, 'guestPhone', bookingData);
                logger.info(`Guest email saved for chat ${chatId}: ${bookingData.guestEmail}`);
                await utils.safeSendMessage(bot, chatId, '📱 Введите ваш номер телефона:', {
                    parse_mode: 'Markdown',
                    ...mainMenuKeyboards.getBackToMenuKeyboard()
                });
            } else if (session.step === 'guestPhone') {
                bookingData.guestPhone = text.trim();
                if (!/^\+?\d{10,15}$/.test(bookingData.guestPhone.replace(/\s/g, ''))) {
                    logger.warn(`Invalid phone format for chat ${chatId}: ${text}`);
                    await utils.safeSendMessage(bot, chatId, '❌ Неверный формат телефона. Введите номер в формате +7XXXXXXXXXX:', {
                        parse_mode: 'Markdown',
                        ...mainMenuKeyboards.getBackToMenuKeyboard()
                    });
                    return;
                }
                await saveBookingSession(chatId, 'paymentType', bookingData);
                logger.info(`Guest phone saved for chat ${chatId}: ${bookingData.guestPhone}`);
                await utils.safeSendMessage(
                    bot,
                    chatId,
                    '💳 Выберите тип оплаты:\n1. Полная оплата\n2. Предоплата 50%',
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: 'Полная оплата', callback_data: 'payment_full' }],
                                [{ text: 'Предоплата 50%', callback_data: 'payment_prepayment' }]
                            ]
                        }
                    }
                );
            }
        } catch (error) {
            logger.error(`Error processing message for chat ${chatId}`, { error });
            await utils.safeSendMessage(
                bot,
                chatId,
                `❌ Ошибка: ${error.message}`,
                {
                    parse_mode: 'Markdown',
                    ...mainMenuKeyboards.getBackToMenuKeyboard()
                }
            );
            await deleteBookingSession(chatId);
            userStates.set(userId, states.MAIN_MENU);
        }
    });

    // Обработка callback запросов
    bot.on("callback_query", async (callbackQuery) => {
        const msg = callbackQuery.message;
        const chatId = msg.chat.id;
        const userId = callbackQuery.from.id;
        const data = callbackQuery.data;

        try {
            await bot.answerCallbackQuery(callbackQuery.id);
            logger.info(`Callback query received for chat ${chatId}: ${data}`);

            if (data === 'payment_full' || data === 'payment_prepayment') {
                const { data: session, error } = await getBookingSession(chatId);
                if (error || !session || session.step !== 'paymentType') {
                    logger.warn(`Invalid or expired booking session for payment selection in chat ${chatId}`);
                    await utils.safeSendMessage(bot, chatId, '❌ Сессия бронирования истекла. Начните заново.', {
                        parse_mode: 'Markdown',
                        ...mainMenuKeyboards.getBackToMenuKeyboard()
                    });
                    userStates.set(userId, states.MAIN_MENU);
                    return;
                }

                let bookingData = session.data || {};
                const paymentType = data === 'payment_full' ? 'full' : 'prepayment';
                bookingData.paymentType = paymentType;

                const nights = Math.ceil((new Date(bookingData.checkOut) - new Date(bookingData.checkIn)) / (1000 * 60 * 60 * 24));
                const room = bookingData.rooms.find(r => r.id === bookingData.roomId);
                const localRoom = services.roomsData.getRoomById(bookingData.roomId);
                bookingData.nights = nights;
                bookingData.totalPrice = localRoom && localRoom.Цена ? localRoom.Цена * nights : calculateTotalPrice(room.pricePerDay || {}, bookingData.checkIn, bookingData.checkOut);

                const bookingResult = await bookingModule.createBooking(bookingData);
                logger.info(`Booking created for chat ${chatId}: bookingNumber ${bookingResult.bookingNumber}, amount ${bookingResult.paymentAmount}`);

                // Уведомление администраторов
                await utils.forwardToAdmins(
                    bot,
                    userId,
                    callbackQuery.from.username,
                    `Новое бронирование №${bookingResult.bookingNumber} от ${bookingData.guestName} на даты ${formatDateForDisplay(bookingData.checkIn)} - ${formatDateForDisplay(bookingData.checkOut)}`
                );
                logger.info(`Admin notification sent for booking ${bookingResult.bookingNumber}`);

                await utils.safeSendMessage(
                    bot,
                    chatId,
                    `✅ Бронирование создано!\nНомер брони: ${bookingResult.bookingNumber}\nСумма: ${bookingResult.paymentAmount} ₽\n\nПерейдите по ссылке для оплаты:\n[${paymentType === 'prepayment' ? 'Предоплата' : 'Полная оплата'}](${bookingResult.paymentUrl})\n\nДаты: ${formatDateForDisplay(bookingData.checkIn)} - ${formatDateForDisplay(bookingData.checkOut)}`,
                    {
                        parse_mode: 'Markdown',
                        ...mainMenuKeyboards.getBackToMenuKeyboard()
                    }
                );

                await deleteBookingSession(chatId);
                userStates.set(userId, states.MAIN_MENU);

                setTimeout(async () => {
                    try {
                        const status = await bookingModule.checkPaymentStatus(bookingResult.bookingId);
                        logger.info(`Payment status checked for booking ${bookingResult.bookingId}: ${status.status}`);
                        if (status.status === 'paid') {
                            await utils.safeSendMessage(
                                bot,
                                chatId,
                                `🎉 Оплата бронирования №${bookingResult.bookingNumber} успешно подтверждена!`,
                                {
                                    parse_mode: 'Markdown',
                                    ...mainMenuKeyboards.getBackToMenuKeyboard()
                                }
                            );
                        } else if (status.status === 'expired') {
                            await utils.safeSendMessage(
                                bot,
                                chatId,
                                `⏰ Время оплаты бронирования №${bookingResult.bookingNumber} истекло.`,
                                {
                                    parse_mode: 'Markdown',
                                    ...mainMenuKeyboards.getBackToMenuKeyboard()
                                }
                            );
                        }
                    } catch (error) {
                        logger.error(`Error checking payment status for booking ${bookingResult.bookingId}`, { error });
                    }
                }, 5 * 60 * 1000);
                return;
            }

            switch (data) {
                case "important_info":
                    await handleImportantInfo(bot, chatId);
                    break;
                case "rooms":
                    const roomsData = services.roomsData.getRoomsData();
                    logger.info(`Displaying rooms for chat ${chatId}, count: ${roomsData.length}`);
                    await utils.safeSendMessage(
                        bot,
                        chatId,
                        "Выберите номер:",
                        mainMenuKeyboards.getRoomsKeyboard(roomsData)
                    );
                    break;
                case "entertainment":
                    await handleEntertainment(bot, chatId);
                    break;
                case "facilities":
                    await handleFacilities(bot, chatId);
                    break;
                case "camping":
                    await handleCamping(bot, chatId);
                    break;
                case "our_beach":
                    await handleOur_beach(bot, chatId);
                    break;
                case "Mangalchik":
                    await handleMangalchik(bot, chatId);
                    break;
                case "directions":
                    await handleDirections(bot, chatId);
                    break;
                case "booking":
                    userStates.set(userId, states.BOOKING_PROCESS);
                    logger.info(`Started booking process for chat ${chatId}`);
                    await utils.safeSendMessage(
                        bot,
                        chatId,
                        "Были ли вы у нас?",
                        mainMenuKeyboards.getBookingKeyboard()
                    );
                    break;
                case "back_to_menu":
                    userStates.set(userId, states.MAIN_MENU);
                    logger.info(`Returned to main menu for chat ${chatId}`);
                    await utils.safeSendMessage(
                        bot,
                        chatId,
                        "Выберите команду из меню или задайте вопрос в чате:",
                        mainMenuKeyboards.getMainMenuKeyboard()
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
            logger.error(`Error processing callback query for chat ${chatId}: ${data}`, { error });
            try {
                await bot.answerCallbackQuery(callbackQuery.id);
            } catch (answerError) {
                logger.error(`Failed to answer callback query for chat ${chatId}`, { answerError });
            }
            await utils.safeSendMessage(
                bot,
                chatId,
                `❌ Ошибка: ${error.message}`,
                {
                    parse_mode: 'Markdown',
                    ...mainMenuKeyboards.getBackToMenuKeyboard()
                }
            );
        }
    });

    // Обработка команды проверки статуса
    bot.onText(/\/checkpayment (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const bookingId = match[1];
        try {
            logger.info(`Checking payment status for booking ${bookingId} in chat ${chatId}`);
            const status = await bookingModule.checkPaymentStatus(bookingId);
            await utils.safeSendMessage(
                bot,
                chatId,
                `Статус бронирования: ${status.status}`,
                {
                    parse_mode: 'Markdown',
                    ...mainMenuKeyboards.getBackToMenuKeyboard()
                }
            );
        } catch (error) {
            logger.error(`Error checking payment status for booking ${bookingId} in chat ${chatId}`, { error });
            await utils.safeSendMessage(
                bot,
                chatId,
                `❌ Ошибка проверки статуса: ${error.message}`,
                {
                    parse_mode: 'Markdown',
                    ...mainMenuKeyboards.getBackToMenuKeyboard()
                }
            );
        }
    });

    // Обработка команды /cancel
    bot.onText(/\/cancel/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        logger.info(`Cancel command received for chat ${chatId}`);
        await deleteBookingSession(chatId);
        userStates.set(userId, states.MAIN_MENU);
        await utils.safeSendMessage(
            bot,
            chatId,
            '❌ Процесс бронирования отменен.',
            {
                parse_mode: 'Markdown',
                ...mainMenuKeyboards.getMainMenuKeyboard()
            }
        );
    });

    // Обработка команды /start
    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        userStates.set(userId, states.MAIN_MENU);
        logger.info(`Start command received for chat ${chatId}`);

        const welcomeMessage = `👋 Здравствуйте! Добро пожаловать на базу отдыха "Золотые Пески" оз. Тургояк 🌲🏡

Меня зовут Юлия, я с радостью помогу вам с подбором размещения.

📍 Перед тем, как мы продолжим, прочтите важную информацию по соответствующей кнопке!

Выберите один из вариантов или задайте вопрос в чате:`;

        await utils.safeSendMessage(bot, chatId, welcomeMessage, {
            parse_mode: "Markdown",
            ...mainMenuKeyboards.getMainMenuKeyboard(),
        });

        if (await utils.isAdmin(bot, userId)) {
            logger.info(`Admin panel accessed for user ${userId} in chat ${chatId}`);
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
        logger.info(`Menu command received for chat ${chatId}`);
        await utils.safeSendMessage(
            bot,
            chatId,
            "Главное меню:",
            mainMenuKeyboards.getMainMenuKeyboard(),
        );
    });

    async function handleBookingYes(bot, chatId) {
        try {
            logger.info(`Starting booking process (booking_yes) for chat ${chatId}`);
            await saveBookingSession(chatId, 'checkIn', {});
            userStates.set(chatId, states.BOOKING_PROCESS);
            await utils.safeSendMessage(
                bot,
                chatId,
                '📅 Введите дату заезда (в формате ДД.ММ.ГГГГ):',
                {
                    parse_mode: 'Markdown',
                    ...mainMenuKeyboards.getBackToMenuKeyboard()
                }
            );
        } catch (error) {
            logger.error(`Error in handleBookingYes for chat ${chatId}`, { error });
            await utils.safeSendMessage(
                bot,
                chatId,
                '❌ Ошибка. Попробуйте снова.',
                {
                    parse_mode: 'Markdown',
                    ...mainMenuKeyboards.getBackToMenuKeyboard()
                }
            );
            userStates.set(chatId, states.MAIN_MENU);
        }
    }

    async function handleImportantInfo(bot, chatId) {
        try {
            logger.info(`Sending important info to chat ${chatId}`);
            await bot.sendDocument(
                chatId,
                "./Правила проживания и отдыха.docx.pdf",
                {
                    caption: "Прошу ознакомиться с правилами проживания",
                },
            );

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
    • Территория базы обрабатывается от клещей.  
    • Однако мы *рекомендуем взять с собой защитные аэрозоли* для дополнительной безопасности.

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
            logger.error(`Error sending important info to chat ${chatId}`, { error });
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
        const photos = [
            "content/camping/1.webp",
            "content/camping/2.webp",
            "content/camping/3.webp",
            "content/camping/4.webp",
            "content/camping/6.webp",
            "content/camping/7.jfif",
            "content/camping/8.jfif",
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
        От главного поворота на нашу базу, проехать еще 100 метров и повернуть налево, перед вывеской синего цвета (последние 2 фото)
        Координаты 55.186718, 60.055969
        [https://yandex.ru/maps/?ll=60.057310%2C55.186488&mode=routes&rtext=~55.186718%2C60.055969&rtt=auto&ruri=~&source=serp_navig&z=19]`;

        try {
            logger.info(`Sending camping info to chat ${chatId}`);
            await bot.sendMediaGroup(
                chatId,
                photos.map((photo) => ({
                    type: "photo",
                    media: photo,
                })),
            );

            await utils.safeSendMessage(bot, chatId, message, {
                parse_mode: "Markdown",
                ...mainMenuKeyboards.getBackToMenuKeyboard(),
            });
        } catch (error) {
            logger.error(`Error sending camping info to chat ${chatId}`, { error });
            await utils.safeSendMessage(bot, chatId, message, {
                parse_mode: "Markdown",
                ...mainMenuKeyboards.getBackToMenuKeyboard(),
            });
        }
    }

    async function handleOur_beach(bot, chatId) {
        const photos = ["content/beach/1.jfif", "content/beach/2.jfif"];

        const message = `🏖🌞 *Дневное пребывание и посещение пляжа*
    🚗 *Парковка для гостей* — 1000 ₽ без ограничения по времени.
    📍 Вы можете находиться на территории и пользоваться пляжем, используя свои покрывала и полотенца.
    🪑 *Использование своих стульев, кресел, шезлонгов* — 200 ₽ с единицы.
    🛋 *Аренда наших шезлонгов* — 500 ₽ в день.
    ✅ Если вы припарковались на нашей платной парковке, плата за использование своих кресел не взимается.
    🐕 *Посещение с собаками любого размера* — 1000 ₽ с человека за все время проживания, обязательно использовать поводок и намордник (для больших собак), даже если собака очень добрая и милая!
    ‼️ *Установка своих мангалов, столов и другого оборудования на территории пляжа ЗАПРЕЩЕНА!*  
    🔥 *Хотите пожарить шашлыки? Арендуйте мангальную зону!*`;

        try {
            logger.info(`Sending beach info to chat ${chatId}`);
            await bot.sendMediaGroup(
                chatId,
                photos.map((photo) => ({
                    type: "photo",
                    media: photo,
                })),
            );

            await utils.safeSendMessage(bot, chatId, message, {
                parse_mode: "Markdown",
                ...mainMenuKeyboards.getBackToMenuKeyboard(),
            });
        } catch (error) {
            logger.error(`Error sending beach info to chat ${chatId}`, { error });
            await utils.safeSendMessage(bot, chatId, message, {
                parse_mode: "Markdown",
                ...mainMenuKeyboards.getBackToMenuKeyboard(),
            });
        }
    }

    async function handleEntertainment(bot, chatId) {
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
        - Баня русская на дровах. Большая, от 8 до 30 человек. Вместительность высокая. Мангальная зона и мангал перед баней. Большая парилка, моечное отделение, большой предбанник с большим столом и скамейками - Стоимость 2500 час, бронирование от трех часов.
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
    5. Йога на открытом воздухе, с поющими чашами для гостей каждую среду, субботу и воскресенье в 9.00 при условии хорошей погоды.
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

        try {
            logger.info(`Sending entertainment info to chat ${chatId}`);
            await bot.sendMediaGroup(
                chatId,
                photos.map((photo) => ({
                    type: "photo",
                    media: photo,
                })),
            );

            await utils.safeSendMessage(bot, chatId, message, {
                parse_mode: "Markdown",
                ...mainMenuKeyboards.getBackToMenuKeyboard(),
            });
        } catch (error) {
            logger.error(`Error sending entertainment info to chat ${chatId}`, { error });
            await utils.safeSendMessage(bot, chatId, message, {
                parse_mode: "Markdown",
                ...mainMenuKeyboards.getBackToMenuKeyboard(),
            });
        }
    }

    async function handleFacilities(bot, chatId) {
        logger.info(`Sending facilities info to chat ${chatId}`);
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
        const photos = [
            "content/mangalchik/1.jfif",
            "content/mangalchik/2.jfif",
        ];

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

        try {
            logger.info(`Sending mangalchik info to chat ${chatId}`);
            await bot.sendMediaGroup(
                chatId,
                photos.map((photo) => ({
                    type: "photo",
                    media: photo,
                })),
            );

            await utils.safeSendMessage(bot, chatId, message, {
                parse_mode: "Markdown",
                ...mainMenuKeyboards.getBackToMenuKeyboard(),
            });
        } catch (error) {
            logger.error(`Error sending mangalchik info to chat ${chatId}`, { error });
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
            logger.info(`Sending directions info to chat ${chatId}`);
            await bot.sendMediaGroup(
                chatId,
                photos.map((photo) => ({
                    type: "photo",
                    media: photo,
                })),
            );

            await utils.safeSendMessage(bot, chatId, message, {
                parse_mode: "Markdown",
                ...mainMenuKeyboards.getBackToMenuKeyboard(),
            });
        } catch (error) {
            logger.error(`Error sending directions info to chat ${chatId}`, { error });
            await utils.safeSendMessage(bot, chatId, message, {
                parse_mode: "Markdown",
                ...mainMenuKeyboards.getBackToMenuKeyboard(),
            });
        }
    }

    async function handleBookingNo(bot, chatId) {
        logger.info(`Handling booking_no for chat ${chatId}`);
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
[Забронировать номер](https://script.google.com/macros/s/AKfycbywmbK6PsGIqGEJQGEK2ix-IQXPG0TNSBXNr-19QODCRxDXWv-ntNllrh5O6X-amWwV/exec)

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
            logger.info(`Showing room details for chat ${chatId}, room ID: ${room.ID}`);
            let roomInfo = `🏠 ${mainMenuKeyboards.escapeHtml(room.Название || "Номер без названия")}\n\n`;
            if (room.Описание) roomInfo += `📝 ${mainMenuKeyboards.escapeHtml(room.Описание)}\n\n`;
            if (room.Тип) roomInfo += `🏷️ Объект аренды: ${mainMenuKeyboards.escapeHtml(room.Тип)}\n`;
            if (room.Комнат) roomInfo += `🏠 Комнат: ${room.Комнат}\n`;
            if (room.Вместимость)
                roomInfo += `👥 Вместимость: ${room.Вместимость} чел. в комнате\n`;
            if (room.Цена) roomInfo += `💰 Цена: от ${room.Цена}₽\n`;
            if (room.Удобства) roomInfo += `🛏️ Удобства: ${mainMenuKeyboards.escapeHtml(room.Удобства)}\n`;
            if (room.Входит)
                roomInfo += `ℹ️ В размещение входит: ${mainMenuKeyboards.escapeHtml(room.Входит)}\n`;

            roomInfo += `\n❓ Остались вопросы? Выберите команду из меню или задайте вопрос в чате:`;

            let photos = services.roomsData.getRoomPhotos(room.ID);
            if (photos.length === 0) {
                logger.warn(`No photos found for room ${room.ID} in chat ${chatId}`);
            }

            if (photos && photos.length > 0) {
                logger.info(`Sending ${photos.length} photos for room ${room.ID} to chat ${chatId}`);
                try {
                    if (photos.length === 1) {
                        await bot.sendPhoto(chatId, photos[0], {
                            caption: roomInfo,
                            parse_mode: "Markdown",
                            reply_markup: mainMenuKeyboards.getRoomDetailsKeyboard().reply_markup,
                        });
                    } else {
                        const mediaGroup = photos.map((photo, index) => ({
                            type: "photo",
                            media: photo,
                            caption: index === 0 ? roomInfo : undefined,
                            parse_mode: index === 0 ? "Markdown" : undefined,
                        }));

                        await bot.sendMediaGroup(chatId, mediaGroup);

                        await utils.safeSendMessage(
                            bot,
                            chatId,
                            "Выберите действие:",
                            {
                                ...mainMenuKeyboards.getRoomDetailsKeyboard(),
                            },
                        );
                    }
                } catch (error) {
                    logger.error(`Error sending media group for room ${room.ID} in chat ${chatId}`, { error });
                    for (let i = 0; i < photos.length; i++) {
                        const photoUrl = photos[i];
                        try {
                            logger.info(`Sending photo ${i + 1}/${photos.length} for room ${room.ID} to chat ${chatId}: ${photoUrl}`);
                            if (i === 0) {
                                await bot.sendPhoto(chatId, photoUrl, {
                                    caption: roomInfo,
                                    parse_mode: "Markdown",
                                });
                            } else {
                                await bot.sendPhoto(chatId, photoUrl);
                            }
                            if (i < photos.length - 1) {
                                await new Promise((resolve) => setTimeout(resolve, 500));
                            }
                        } catch (photoError) {
                            logger.error(`Error sending photo ${photoUrl} for room ${room.ID} in chat ${chatId}`, { photoError });
                            await utils.safeSendMessage(
                                bot,
                                chatId,
                                `📷 Фотография недоступна`,
                                {
                                    parse_mode: "Markdown",
                                }
                            );
                        }
                    }
                    await utils.safeSendMessage(
                        bot,
                        chatId,
                        "Выберите действие:",
                        {
                            ...mainMenuKeyboards.getRoomDetailsKeyboard(),
                        },
                    );
                }
            } else {
                await utils.safeSendMessage(bot, chatId, roomInfo, {
                    parse_mode: "Markdown",
                    ...mainMenuKeyboards.getRoomDetailsKeyboard(),
                });
            }
        } else {
            logger.warn(`Room with index ${roomIndex} not found for chat ${chatId}`);
            await utils.safeSendMessage(
                bot,
                chatId,
                "Информация о номере не найдена",
                {
                    parse_mode: "Markdown",
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