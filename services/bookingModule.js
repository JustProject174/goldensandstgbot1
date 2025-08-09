const axios = require('axios');
const axiosRetry = require('axios-retry').default; // Добавьте .default
const winston = require('winston');

// Настройка логгера
const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Настройка retry для axios
axiosRetry(axios, {
  retries: 3,
  retryDelay: (retryCount) => retryCount * 2000, // Увеличьте задержку до 2с, 4с, 6с для надёжности
  shouldResetTimeout: true, // Рекомендуется для версии 4.x
  retryCondition: (error) => {
    return error.code === 'ECONNRESET' || error.message.includes('socket') || error.message.includes('timeout');
  }
});

const GAS_URL = process.env.GAS_URL || 'https://script.google.com/macros/s/AKfycbywmbK6PsGIqGEJQGEK2ix-IQXPG0TNSBXNr-19QODCRxDXWv-ntNllrh5O6X-amWwV/exec';

async function getAvailableRooms(checkIn, checkOut) {
  logger.info(`Запрос доступных номеров: checkIn=${checkIn}, checkOut=${checkOut}`);
  try {
    logger.debug(`Отправка GET-запроса на ${GAS_URL}?action=get_free_rooms&from=${checkIn}&to=${checkOut}`);
    const response = await axios.get(`${GAS_URL}?action=get_free_rooms&from=${checkIn}&to=${checkOut}`);
    logger.info(`Успешный ответ от сервера: ${JSON.stringify(response.data)}`);
    return response.data;
  } catch (error) {
    logger.error(`Ошибка получения доступных номеров: ${error.message}`);
    if (error.response) {
      logger.error(`Статус ответа: ${error.response.status}, Данные: ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      logger.error('Запрос отправлен, но ответа не получено');
    } else {
      logger.error(`Ошибка настройки запроса: ${error.message}`);
    }
    throw new Error('Не удалось получить список номеров');
  }
}

async function createBooking(bookingData) {
  logger.info(`Создание бронирования: ${JSON.stringify(bookingData)}`);
  const requiredFields = ['roomId', 'checkIn', 'checkOut', 'guestEmail', 'paymentType', 'totalPrice', 'nights'];
  for (const field of requiredFields) {
    if (!bookingData[field]) {
      logger.error(`Отсутствует обязательное поле: ${field}`);
      throw new Error(`Отсутствует обязательное поле: ${field}`);
    }
  }
  try {
    const payload = {
      action: 'createBooking',
      bookingData: {
        roomId: bookingData.roomId,
        checkIn: bookingData.checkIn,
        checkOut: bookingData.checkOut,
        guestName: bookingData.guestName || '',
        guestEmail: bookingData.guestEmail,
        guestPhone: bookingData.guestPhone || '',
        paymentType: bookingData.paymentType,
        totalPrice: bookingData.totalPrice,
        nights: bookingData.nights,
        telegramChatId: bookingData.telegramChatId || '' // Передаём chat_id пользователя
      }
    };
    logger.debug(`Отправка POST-запроса на ${GAS_URL} с данными: ${JSON.stringify(payload)}`);
    const response = await axios.post(GAS_URL, payload, { timeout: 15000 });
    logger.info(`Успешное создание бронирования: ${JSON.stringify(response.data)}`);
    return response.data;
  } catch (error) {
    logger.error(`Ошибка создания бронирования: ${error.message}`);
    if (error.response) {
      logger.error(`Статус ответа: ${error.response.status}, Данные: ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      logger.error('Запрос отправлен, но ответа не получено');
    } else {
      logger.error(`Ошибка настройки запроса: ${error.message}`);
    }
    throw new Error('Не удалось создать бронирование');
  }
}

async function checkPaymentStatus(bookingId) {
  logger.info(`Проверка статуса платежа для bookingId=${bookingId}`);
  try {
    logger.debug(`Отправка GET-запроса на ${GAS_URL}?action=check_payment&booking_id=${bookingId}`);
    const response = await axios.get(`${GAS_URL}?action=check_payment&booking_id=${bookingId}`);
    logger.info(`Статус платежа: ${JSON.stringify(response.data)}`);
    return response.data;
  } catch (error) {
    logger.error(`Ошибка проверки статуса платежа: ${error.message}`);
    if (error.response) {
      logger.error(`Статус ответа: ${error.response.status}, Данные: ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      logger.error('Запрос отправлен, но ответа не получено');
    } else {
      logger.error(`Ошибка настройки запроса: ${error.message}`);
    }
    throw new Error('Не удалось проверить статус платежа');
  }
}

module.exports = {
  getAvailableRooms,
  createBooking,
  checkPaymentStatus
};