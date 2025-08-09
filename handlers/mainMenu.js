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

    function formatDateForGAS(date) {
        const d = new Date(date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function getLocalRoomId(googleRoomId) {
        // Для номеров типа "Эконом" преобразуем ID (например, 101 → 1)
        if (googleRoomId >= 100) {
            return Math.floor(googleRoomId / 100);
        }
        return googleRoomId;
    }

    async function sendGroupedRooms(bot, chatId, availableRooms, localRooms, bookingData) {
        try {
            // Валидация данных
            if (!Array.isArray(availableRooms) || !Array.isArray(localRooms)) {
                throw new Error('Invalid rooms data');
            }

            // Создаем маппинг для быстрого доступа
            const localRoomsMap = localRooms.reduce((map, room) => {
                map[room.ID] = room;
                return map;
            }, {});

            // Группируем номера по типам
            const roomsByType = availableRooms.reduce((groups, room) => {
                const type = room.type || 'Другие';
                if (!groups[type]) groups[type] = [];
                groups[type].push(room);
                return groups;
            }, {});

            let message = '🏠 *Доступные номера*\n\n';
            const flatRoomsList = [];

            // Формируем сообщение
            Object.entries(roomsByType).forEach(([type, rooms]) => {
                message += `*${type}*\n`;

                rooms.forEach((room, index) => {
                    const localData = localRoomsMap[room.id] || {};
                    const roomNumber = flatRoomsList.length + 1;
                    const fridgeStatus = room.name.includes('с холодильником') ? '❄' :
                                       room.name.includes('без холодильника') ? '.' : '';

                    message += `${roomNumber}. ${room.name.replace(/"/g, '')} — ${room.totalPrice} ₽`;
                    if (localData.Вместимость) message += ` 🛏 ${localData.Вместимость}`;
                    if (fridgeStatus) message += ` ${fridgeStatus}`;
                    message += '\n';

                    flatRoomsList.push(room);
                });

                message += '\n';
            });

            message += '_Выберите номер или используйте фильтры_';

            // Сохраняем полный список номеров
            bookingData.rooms = flatRoomsList;
            if (!bookingData.allRooms) {
                bookingData.allRooms = [...flatRoomsList];
            }

            // Клавиатура с фильтрами
            const keyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: 'Коттеджи', callback_data: 'filter_cottages' },
                            { text: 'Комнаты', callback_data: 'filter_rooms' }
                        ],
                        [
                            { text: 'По цене ↑', callback_data: 'sort_price_asc' },
                            { text: 'По цене ↓', callback_data: 'sort_price_desc' }
                        ],
                        ...mainMenuKeyboards.getBackToMenuKeyboard().reply_markup.inline_keyboard
                    ]
                }
            };

            await saveBookingSession(chatId, 'roomSelection', bookingData);
            await bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                ...keyboard
            });

        } catch (error) {
            logger.error('Ошибка формирования списка номеров', {
                chatId,
                error: error.message,
                availableRooms: availableRooms?.slice(0, 3),
                localRooms: localRooms?.slice(0, 3)
            });

            await utils.safeSendMessage(bot, chatId, '❌ Не удалось загрузить список номеров', {
                parse_mode: 'Markdown',
                ...mainMenuKeyboards.getBackToMenuKeyboard()
            });

            throw error;
        }
    }

    // Обработка текстовых сообщений
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const text = msg.text;

        // Игнорировать команды
        if (text.startsWith('/')) return;

        const state = userStates.get(userId);

        if (state === states.BOOKING_PROCESS) {
            // Обработка бронирования
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

                    let rooms;
                    try {
                        rooms = await bookingModule.getAvailableRooms(bookingData.checkIn, bookingData.checkOut);
                        logger.debug(`Fetched available rooms for chat ${chatId}`, { roomCount: rooms?.length });
                    } catch (error) {
                        logger.error(`Error fetching available rooms for chat ${chatId}`, { error });
                        await utils.safeSendMessage(bot, chatId, '❌ Ошибка при получении списка номеров. Попробуйте позже.', {
                            parse_mode: 'Markdown',
                            ...mainMenuKeyboards.getBackToMenuKeyboard()
                        });
                        await deleteBookingSession(chatId);
                        userStates.set(userId, states.MAIN_MENU);
                        return;
                    }

                    if (!Array.isArray(rooms)) {
                        logger.error(`Invalid rooms data from getAvailableRooms for chat ${chatId}`, { rooms });
                        await utils.safeSendMessage(bot, chatId, '❌ Ошибка: данные о номерах недоступны. Попробуйте позже.', {
                            parse_mode: 'Markdown',
                            ...mainMenuKeyboards.getBackToMenuKeyboard()
                        });
                        await deleteBookingSession(chatId);
                        userStates.set(userId, states.MAIN_MENU);
                        return;
                    }
                    if (rooms.length === 0) {
                        logger.warn(`No available rooms for dates ${bookingData.checkIn} to ${bookingData.checkOut} for chat ${chatId}`);
                        await utils.safeSendMessage(bot, chatId, '❌ Нет доступных номеров на указанные даты.', {
                            parse_mode: 'Markdown',
                            ...mainMenuKeyboards.getBackToMenuKeyboard()
                        });
                        await deleteBookingSession(chatId);
                        userStates.set(userId, states.MAIN_MENU);
                        return;
                    }

                    const localRooms = services.roomsData.getRoomsData();
                    if (!Array.isArray(localRooms)) {
                        logger.error(`Invalid localRooms data for chat ${chatId}`, { localRooms });
                        await utils.safeSendMessage(bot, chatId, '❌ Ошибка: данные о локальных номерах недоступны. Попробуйте позже.', {
                            parse_mode: 'Markdown',
                            ...mainMenuKeyboards.getBackToMenuKeyboard()
                        });
                        await deleteBookingSession(chatId);
                        userStates.set(userId, states.MAIN_MENU);
                        return;
                    }

                    logger.debug(`Rooms data before filtering:`, { roomsCount: rooms.length, localRoomsCount: localRooms.length });
                    const filteredRooms = rooms.filter(googleRoom => {
                        const localId = getLocalRoomId(googleRoom.id);
                        return localRooms.some(localRoom => String(localRoom.ID) === String(localId));
                    });
                    logger.debug(`Filtered rooms:`, { filteredRoomsCount: filteredRooms.length });

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

                    try {
                        await sendGroupedRooms(bot, chatId, filteredRooms, localRooms, bookingData);
                    } catch (error) {
                        logger.error(`Error in sendGroupedRooms for chat ${chatId}`, { error });
                        await utils.safeSendMessage(bot, chatId, '❌ Ошибка при отображении списка номеров. Попробуйте позже.', {
                            parse_mode: 'Markdown',
                            ...mainMenuKeyboards.getBackToMenuKeyboard()
                        });
                        await deleteBookingSession(chatId);
                        userStates.set(userId, states.MAIN_MENU);
                        return;
                    }
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
        } else if (state === states.ASKING_QUESTIONS && text.trim().length > 0) {
            logger.info(`Processing question in ASKING_QUESTIONS for user ${userId} in chat ${chatId}: ${text}`);
            const answer = services.knowledgeBase.findAnswerInKnowledgeBase(text);
            if (answer) {
                await utils.safeSendMessage(bot, chatId, answer, {
                    parse_mode: 'Markdown'
                });
            } else {
                logger.info(`Forwarding question from user ${userId} in chat ${chatId}: ${text}`);
                await utils.forwardToAdmins(bot, userId, msg.from.username, msg.text);
            }
        } else if (state === states.MAIN_MENU && text.trim().length > 0) {
            logger.info(`Ignored text message in MAIN_MENU for chat ${chatId}: ${text}`);
            await utils.safeSendMessage(bot, chatId, 'Пожалуйста, используйте кнопки меню для навигации. Если у вас вопрос, нажмите "Задать вопрос администратору".', {
                parse_mode: 'Markdown',
                ...mainMenuKeyboards.getMainMenuKeyboard()
            });
        }
    });

    // Обработка callback запросов
    bot.on("callback_query", async (callbackQuery) => {
        const msg = callbackQuery.message;
        const chatId = msg.chat.id;
        const data = callbackQuery.data;
        const userId = callbackQuery.from.id;

        try {
            await bot.answerCallbackQuery(callbackQuery.id);

            if (data.startsWith('filter_')) {
                const { data: session, error } = await getBookingSession(chatId);
                if (error || !session || session.step !== 'roomSelection') {
                    await utils.safeSendMessage(bot, chatId, '❌ Сессия бронирования устарела. Начните заново.', {
                        parse_mode: 'Markdown',
                        ...mainMenuKeyboards.getBackToMenuKeyboard()
                    });
                    return;
                }

                const bookingData = session.data || {};
                const allRooms = bookingData.allRooms || bookingData.rooms || [];
                let filteredRooms = [...allRooms];

                // Применяем фильтр
                switch(data) {
                    case 'filter_cottages':
                        filteredRooms = allRooms.filter(room =>
                            room.type.includes('Коттедж') ||
                            room.type.includes('Дом'));
                        break;
                    case 'filter_rooms':
                        filteredRooms = allRooms.filter(room =>
                            room.type.includes('Комната') ||
                            room.type.includes('Эконом'));
                        break;
                    case 'sort_price_asc':
                        filteredRooms.sort((a, b) => a.totalPrice - b.totalPrice);
                        break;
                    case 'sort_price_desc':
                        filteredRooms.sort((a, b) => b.totalPrice - a.totalPrice);
                        break;
                }

                // Получаем актуальные данные о комнатах
                const localRooms = services.roomsData.getRoomsData();

                // Обновляем данные сессии
                bookingData.rooms = filteredRooms;
                await saveBookingSession(chatId, 'roomSelection', bookingData);

                // Удаляем старое сообщение
                try {
                    await bot.deleteMessage(chatId, msg.message_id);
                } catch (e) {
                    logger.warn('Не удалось удалить сообщение', { error: e.message });
                }

                // Отправляем новый список
                await sendGroupedRooms(bot, chatId, filteredRooms, localRooms, bookingData);
                return;
            }

            // Обработка выбора типа оплаты
            if (data === 'payment_full' || data === 'payment_prepayment') {
                logger.info(`Processing payment type selection for chat ${chatId}`, { paymentType: data });
                const { data: session, error: sessionError } = await getBookingSession(chatId);
                if (sessionError || !session || session.step !== 'paymentType') {
                    logger.warn(`Invalid booking session during payment selection for chat ${chatId}`, {
                        error: sessionError,
                        sessionExists: !!session,
                        currentStep: session?.step
                    });
                    await utils.safeSendMessage(bot, chatId, '❌ Сессия бронирования истекла. Пожалуйста, начните процесс заново.', {
                        parse_mode: 'Markdown',
                        ...mainMenuKeyboards.getBackToMenuKeyboard()
                    });
                    userStates.set(userId, states.MAIN_MENU);
                    return;
                }

                let bookingData = session.data || {};
                const paymentType = data === 'payment_full' ? 'full' : 'prepayment';
                bookingData.paymentType = paymentType;

                logger.debug(`Payment type selected for chat ${chatId}`, { paymentType: paymentType });
                const room = bookingData.rooms.find(r => r.id === bookingData.roomId);
                if (!room) {
                    logger.error(`Selected room not found during payment processing for chat ${chatId}`, {
                        roomId: bookingData.roomId,
                        availableRooms: bookingData.rooms.map(r => r.id)
                    });
                    await utils.safeSendMessage(bot, chatId, '❌ Ошибка: выбранный номер не найден в системе. Пожалуйста, начните процесс заново.', {
                        parse_mode: 'Markdown',
                        ...mainMenuKeyboards.getBackToMenuKeyboard()
                    });
                    await deleteBookingSession(chatId);
                    userStates.set(userId, states.MAIN_MENU);
                    return;
                }

                bookingData.totalPrice = room.totalPrice;
                if (!bookingData.totalPrice || bookingData.totalPrice <= 0) {
                    logger.error(`Invalid room price during payment processing for chat ${chatId}`, {
                        roomId: room.id,
                        roomName: room.name,
                        price: bookingData.totalPrice
                    });
                    await utils.safeSendMessage(bot, chatId, '❌ Ошибка: цена бронирования не указана или некорректна. Пожалуйста, начните процесс заново.', {
                        parse_mode: 'Markdown',
                        ...mainMenuKeyboards.getBackToMenuKeyboard()
                    });
                    await deleteBookingSession(chatId);
                    userStates.set(userId, states.MAIN_MENU);
                    return;
                }

                const nights = Math.ceil((new Date(bookingData.checkOut) - new Date(bookingData.checkIn)) / (1000 * 60 * 60 * 24));
                bookingData.nights = nights;
                bookingData.telegramChatId = chatId.toString();

                logger.info(`Saving payment details to booking session for chat ${chatId}`, {
                    totalPrice: bookingData.totalPrice,
                    nights: bookingData.nights,
                    paymentType: bookingData.paymentType
                });

                const saveResult = await saveBookingSession(chatId, 'confirmBooking', bookingData);
                if (!saveResult || saveResult.error) {
                  logger.error(`Ошибка сохранения: ${saveResult?.error || 'saveResult undefined'}`);
                  throw new Error('Не удалось сохранить данные оплаты');
                }

                let bookingResult;
                try {
                    logger.info(`Creating booking for chat ${chatId}`, {
                        bookingData: {
                            checkIn: bookingData.checkIn,
                            checkOut: bookingData.checkOut,
                            roomId: bookingData.roomId,
                            guestName: bookingData.guestName,
                            totalPrice: bookingData.totalPrice
                        }
                    });
                    bookingResult = await bookingModule.createBooking(bookingData);
                    logger.debug(`Booking creation response for chat ${chatId}`, { bookingResult });
                } catch (err) {
                    logger.error(`Error creating booking for chat ${chatId}`, { error: err });
                    await utils.safeSendMessage(
                        bot,
                        chatId,
                        '❌ Ошибка создания бронирования. Пожалуйста, попробуйте позже или свяжитесь с администратором.',
                        {
                            parse_mode: 'Markdown',
                            ...mainMenuKeyboards.getBackToMenuKeyboard()
                        }
                    );
                    await deleteBookingSession(chatId);
                    userStates.set(userId, states.MAIN_MENU);
                    return;
                }

                if (!bookingResult || !bookingResult.success || !bookingResult.bookingNumber || !bookingResult.paymentUrl || !bookingResult.paymentAmount) {
                    logger.error(`Invalid booking result for chat ${chatId}`, { bookingResult });
                    await utils.safeSendMessage(
                        bot,
                        chatId,
                        '❌ Ошибка создания бронирования. Получен некорректный ответ от системы бронирования. Пожалуйста, попробуйте позже или свяжитесь с администратором.',
                        {
                            parse_mode: 'Markdown',
                            ...mainMenuKeyboards.getBackToMenuKeyboard()
                        }
                    );
                    await deleteBookingSession(chatId);
                    userStates.set(userId, states.MAIN_MENU);
                    return;
                }

                logger.info(`Booking successfully created for chat ${chatId}`, {
                    bookingNumber: bookingResult.bookingNumber,
                    paymentAmount: bookingResult.paymentAmount,
                    bookingId: bookingResult.bookingId
                });

                await deleteBookingSession(chatId);
                userStates.set(userId, states.MAIN_MENU);

                setTimeout(async () => {
                    try {
                        logger.debug(`Checking payment status for booking ${bookingResult.bookingId} from chat ${chatId}`);
                        const status = await bookingModule.checkPaymentStatus(bookingResult.bookingId);
                        logger.info(`Payment status check result for booking ${bookingResult.bookingId}`, { status: status.status });
                        if (status.status === 'paid') {
                            await utils.safeSendMessage(
                                bot,
                                chatId,
                                `🎉 Оплата бронирования №${escapeMarkdown(bookingResult.bookingNumber)} успешно подтверждена! Спасибо за выбор нашей базы отдыха!`,
                                {
                                    parse_mode: 'Markdown',
                                    ...mainMenuKeyboards.getBackToMenuKeyboard()
                                }
                            );
                        } else if (status.status === 'expired') {
                            await utils.safeSendMessage(
                                bot,
                                chatId,
                                `⏰ Время оплаты бронирования №${escapeMarkdown(bookingResult.bookingNumber)} истекло. Для нового бронирования воспользуйтесь меню.`,
                                {
                                    parse_mode: 'Markdown',
                                    ...mainMenuKeyboards.getBackToMenuKeyboard()
                                }
                            );
                        }
                    } catch (error) {
                        logger.error(`Error checking payment status for booking ${bookingResult.bookingId}`, { error });
                    }
                }, 5 * 60 * 1000); // 5 минут

                return;
            }

            switch (data) {
                case "important_info":
                    logger.debug(`Processing 'important_info' callback for chat ${chatId}`);
                    await handleImportantInfo(bot, chatId);
                    break;
                case "rooms":
                    const roomsData = services.roomsData.getRoomsData();
                    console.log(
                        "Отображение номеров. Количество:",
                        roomsData.length,
                    );
                    await utils.safeSendMessage(
                        bot,
                        chatId,
                        "Выберите номер:",
                        roomsKeyboards.getRoomsKeyboard(roomsData),
                    );
                    break;
                case "entertainment":
                    logger.debug(`Processing 'entertainment' callback for chat ${chatId}`);
                    await handleEntertainment(bot, chatId);
                    break;
                case "facilities":
                    logger.debug(`Processing 'facilities' callback for chat ${chatId}`);
                    await handleFacilities(bot, chatId);
                    break;
                case "camping":
                    logger.debug(`Processing 'camping' callback for chat ${chatId}`);
                    await handleCamping(bot, chatId);
                    break;
                case "our_beach":
                    logger.debug(`Processing 'our_beach' callback for chat ${chatId}`);
                    await handleOur_beach(bot, chatId);
                    break;
                case "Mangalchik":
                    logger.debug(`Processing 'Mangalchik' callback for chat ${chatId}`);
                    await handleMangalchik(bot, chatId);
                    break;
                case "directions":
                    logger.debug(`Processing 'directions' callback for chat ${chatId}`);
                    await handleDirections(bot, chatId);
                    break;
                case "booking":
                    logger.info(`Starting booking process for chat ${chatId}`);
                    userStates.set(userId, states.BOOKING_PROCESS);
                    await utils.safeSendMessage(
                        bot,
                        chatId,
                        "Добро пожаловать в модуль бронирования! Подскажите, вы ознакомились с нашими условиями проживания?",
                        mainMenuKeyboards.getBookingKeyboard()
                    );
                    break;
                case "back_to_menu":
                    logger.info(`Returning to main menu for chat ${chatId}`);
                    userStates.set(userId, states.MAIN_MENU);
                    await utils.safeSendMessage(
                        bot,
                        chatId,
                        "Выберите команду из меню или задайте вопрос в чате:",
                        mainMenuKeyboards.getMainMenuKeyboard()
                    );
                    break;
                case "booking_yes":
                    logger.debug(`Processing 'booking_yes' callback for chat ${chatId}`);
                    await handleBookingYes(bot, chatId);
                    break;
                case "booking_no":
                    logger.debug(`Processing 'booking_no' callback for chat ${chatId}`);
                    await handleBookingNo(bot, chatId);
                    break;
                case "ask_admin":
                    logger.info(`Starting admin questions mode for chat ${chatId}`);
                    userStates.set(userId, states.ASKING_QUESTIONS);
                    await utils.safeSendMessage(
                        bot,
                        chatId,
                        "Задайте ваш вопрос администратору. Вы можете отправить несколько сообщений. Для завершения нажмите кнопку ниже.",
                        {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: 'Завершить вопросы', callback_data: 'end_questions' }]
                                ]
                            }
                        }
                    );
                    break;
                case "end_questions":
                    logger.info(`Ending admin questions mode for chat ${chatId}`);
                    userStates.set(userId, states.MAIN_MENU);
                    await utils.safeSendMessage(
                        bot,
                        chatId,
                        "Спасибо за ваши вопросы! Мы ответим вам в ближайшее время. Выберите команду из меню:",
                        mainMenuKeyboards.getMainMenuKeyboard()
                    );
                    break;
                default:
                    if (data.startsWith("room_")) {
                        logger.debug(`Processing room details callback for chat ${chatId}`, { roomData: data });
                        await handleRoomDetails(bot, chatId, data);
                    } else {
                        logger.warn(`Unknown callback data received from chat ${chatId}`, { callbackData: data });
                    }
                    break;
            }
            } catch (error) {
                logger.error('Ошибка обработки callback', {
                    chatId,
                    error: error.message,
                    stack: error.stack
                });

                await utils.safeSendMessage(bot, chatId, '❌ Произошла ошибка. Попробуйте снова.', {
                    parse_mode: 'Markdown',
                    ...mainMenuKeyboards.getBackToMenuKeyboard()
                });
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
                            [{ text: "⚙️ Админ-панель", callback_data: "admin_panel" }],
                        ],
                    },
                }
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
            mainMenuKeyboards.getMainMenuKeyboard()
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
                { caption: "Прошу ознакомиться с правилами проживания" },
                { contentType: 'application/pdf' }
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
• Длительное проживание (от 5 дней) - баня в подарок один раз и бесплатная парковка.
• Уточняйте актуальные предложения при бронировании
Какие либо льготы для конкретных групп людей не предусмотрены.
Если такие условия вас устраивают, давайте расскажу подробнее 😊
Выберите команду из меню или задайте вопрос в чате:`,
                    parse_mode: "Markdown",
                    ...mainMenuKeyboards.getBackToMenuKeyboard(),
                }
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
                }
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
🚗 *Парковка для гостей* — 1000 ₽.
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
    - Баня русская на дровах. Малая - максимальная вместимость 6 человек. Стоимость 2000 час от 1.5 часов.
  📍Посещение по обязательной предварительной брони.
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
7. Организация поездок на катере по озеру и до острова Веры.
    🚗 *Парковка оплачивается отдельно* — 1000 ₽ в сутки.
    При бронировании номера мангальная зона входит в стоимость номера (мангальная зона, расположенная около домиков).
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
  1000 руб день / сутки , если вы ничего не арендуете на базе.
• Чистейшая родниковая вода из озера
• Запас питьевой воды, решётки и угли — берите с собой
Остались вопросы? Выберите команду из меню или задайте вопрос в чате:`,
            {
                parse_mode: "Markdown",
                ...mainMenuKeyboards.getBackToMenuKeyboard(),
            }
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
            "content/road/50c10319-d3d4-4488-bccf-58b2f16b00df.png",
            "content/road/d6f84703-8cba-4217-a3ca-b42d2da16d27.jfif",
        ];
        const message = `📍 Координаты:
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
            }
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
            if (room.Вместимость) roomInfo += `👥 Вместимость: ${room.Вместимость} чел. в комнате\n`;
            if (room.Цена) roomInfo += `💰 Цена: от ${room.Цена}₽\n`;
            if (room.Удобства) roomInfo += `🛏️ Удобства: ${mainMenuKeyboards.escapeHtml(room.Удобства)}\n`;
            if (room.Входит) roomInfo += `ℹ️ В размещение входит: ${mainMenuKeyboards.escapeHtml(room.Входит)}\n`;
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
                            }
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
                        }
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
                            [{ text: "🔙 К списку номеров", callback_data: "rooms" }],
                        ],
                    },
                }
            );
        }
    }
};