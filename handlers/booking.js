// booking.js
require('dotenv').config();
const { google } = require('googleapis');
const axios = require('axios');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// Конфигурация
const CONFIG = {
  sheetId: process.env.GOOGLE_SHEET_ID,
  sheets: {
    rooms: 'Номера',
    bookings: 'Бронирования',
    calendar: 'Календарь',
    payments: 'Платежи',
    settings: 'Настройки',
    prices: 'Цены',
  },
  yookassa: {
    apiUrl: 'https://api.yookassa.ru/v3/',
    returnUrl: process.env.YOOKASSA_RETURN_URL,
    prepaymentPercentage: 0.5, // 50% предоплата
  },
  email: {
    from: process.env.EMAIL_FROM || 'no-reply@example.com',
    subject: 'Подтверждение бронирования',
  },
};

// Настройка Google Sheets API
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_CREDENTIALS_PATH, // Путь к файлу с учетными данными
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

// Настройка Nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Получение листа по имени
async function getSheet(sheetName) {
  if (!sheetName) throw new Error('Не указано имя листа');
  try {
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: CONFIG.sheetId,
    });
    const sheet = spreadsheet.data.sheets.find(
      (s) => s.properties.title === sheetName
    );
    if (!sheet) throw new Error(`Лист "${sheetName}" не найден`);
    return sheetName;
  } catch (error) {
    throw new Error(`Ошибка получения листа "${sheetName}": ${error.message}`);
  }
}

// Проверка доступности номера
async function isRoomAvailable(roomId, checkIn, checkOut) {
  try {
    const calendarSheet = await getSheet(CONFIG.sheets.calendar);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: CONFIG.sheetId,
      range: `${calendarSheet}!A:J`,
    });
    const data = response.data.values || [];

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[0] == roomId) {
        const bookedFrom = new Date(row[1]);
        const bookedTo = new Date(row[2]);
        if (checkInDate < bookedTo && checkOutDate > bookedFrom) {
          return false;
        }
      }
    }
    return true;
  } catch (error) {
    console.error('Ошибка в isRoomAvailable:', error);
    throw error;
  }
}

// Получение доступных номеров
async function getAvailableRooms(checkIn, checkOut) {
  try {
    const roomsSheet = await getSheet(CONFIG.sheets.rooms);
    const calendarSheet = await getSheet(CONFIG.sheets.calendar);
    const pricesSheet = await getSheet(CONFIG.sheets.prices);

    const roomsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: CONFIG.sheetId,
      range: `${roomsSheet}!A:E`,
    });
    const calendarResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: CONFIG.sheetId,
      range: `${calendarSheet}!A:J`,
    });
    const pricesResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: CONFIG.sheetId,
      range: `${pricesSheet}!A:I`,
    });

    const roomsData = roomsResponse.data.values || [];
    const calendarData = calendarResponse.data.values || [];
    const pricesData = pricesResponse.data.values || [];
    const pricesHeaders = pricesData[0];

    const available = [];

    for (let i = 1; i < roomsData.length; i++) {
      const roomRow = roomsData[i];
      const roomId = roomRow[0];

      const isFree = !calendarData.some(
        (b) =>
          b[0] == roomId &&
          isDateOverlap(checkIn, checkOut, b[1], b[2])
      );
      if (!isFree) continue;

      const pricePerDay = {};
      for (let j = 1; j < pricesData.length; j++) {
        const priceRow = pricesData[j];
        if (priceRow[0] == roomId) {
          const month = String(priceRow[1]).padStart(2, '0');
          const days = {
            Пн: 2,
            Вт: 3,
            Ср: 4,
            Чт: 5,
            Пт: 6,
            Сб: 7,
            Вс: 8,
          };

          for (const [dayName, colIndex] of Object.entries(days)) {
            const priceKey = `${month}${dayName}`;
            pricePerDay[priceKey] = parseFloat(priceRow[colIndex]) || 0;
          }
        }
      }

      available.push({
        id: roomRow[0],
        name: roomRow[1],
        type: roomRow[2],
        capacity: roomRow[3],
        description: roomRow[4] || '',
        pricePerDay,
      });
    }

    return available;
  } catch (error) {
    console.error('Ошибка в getAvailableRooms:', error);
    throw error;
  }
}

// Создание бронирования
async function createBooking(bookingData) {
  try {
    // Валидация входных данных
    if (
      !bookingData ||
      !bookingData.roomId ||
      !bookingData.checkIn ||
      !bookingData.checkOut ||
      !bookingData.paymentType ||
      !bookingData.guestEmail
    ) {
      throw new Error('Недостаточно данных для бронирования');
    }

    if (!['full', 'prepayment'].includes(bookingData.paymentType)) {
      throw new Error('Недопустимый тип оплаты');
    }

    // Проверка доступности номера
    const isAvailable = await isRoomAvailable(
      bookingData.roomId,
      bookingData.checkIn,
      bookingData.checkOut
    );
    if (!isAvailable) {
      throw new Error('Выбранный номер уже занят на указанные даты.');
    }

    // Генерация данных бронирования
    const bookingId = uuidv4();
    const bookingNumber = generateBookingNumber();
    const expiresAt = new Date(Date.now() + 3600000);

    const totalPrice = bookingData.totalPrice || 0;
    const prepaymentPercentage =
      bookingData.paymentType === 'prepayment'
        ? CONFIG.yookassa.prepaymentPercentage
        : 1;
    const paymentAmount = totalPrice * prepaymentPercentage;
    const pricePerNight =
      bookingData.nights && bookingData.nights > 0
        ? totalPrice / bookingData.nights
        : 0;

    // Запись в календарь
    const calendarSheet = await getSheet(CONFIG.sheets.calendar);
    await sheets.spreadsheets.values.append({
      spreadsheetId: CONFIG.sheetId,
      range: `${calendarSheet}!A:K`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [
          [
            bookingData.roomId,
            bookingData.checkIn,
            bookingData.checkOut,
            bookingId,
            bookingData.guestName || '',
            bookingData.guestPhone || '',
            paymentAmount,
            'Через сайт',
            bookingData.paymentType,
            prepaymentPercentage,
            totalPrice,
          ],
        ],
      },
    });

    // Запись в бронирования
    const bookingsSheet = await getSheet(CONFIG.sheets.bookings);
    await sheets.spreadsheets.values.append({
      spreadsheetId: CONFIG.sheetId,
      range: `${bookingsSheet}!A:P`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [
          [
            bookingId,
            bookingNumber,
            bookingData.roomId,
            bookingData.guestName || '',
            bookingData.guestEmail || '',
            bookingData.guestPhone || '',
            bookingData.checkIn,
            bookingData.checkOut,
            new Date(),
            'Ожидает оплаты',
            expiresAt,
            pricePerNight,
            paymentAmount,
            bookingData.paymentType,
            prepaymentPercentage,
            totalPrice,
          ],
        ],
      },
    });

    // Создание платежа
    const paymentResult = await createYooKassaPayment(
      paymentAmount,
      bookingId,
      `Бронирование №${bookingNumber} (${
        bookingData.paymentType === 'prepayment'
          ? 'Предоплата ' + prepaymentPercentage * 100 + '%'
          : 'Полная оплата'
      })`
    );

    // Запись платежа
    const paymentsSheet = await getSheet(CONFIG.sheets.payments);
    await sheets.spreadsheets.values.append({
      spreadsheetId: CONFIG.sheetId,
      range: `${paymentsSheet}!A:J`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [
          [
            paymentResult.id,
            bookingId,
            'no',
            expiresAt,
            paymentAmount,
            paymentResult.status,
            '',
            '',
            paymentResult.confirmationUrl,
            bookingData.paymentType,
          ],
        ],
      },
    });

    // Отправка уведомлений
    const telegramData = {
      bookingNumber,
      guestName: bookingData.guestName || '',
      email: bookingData.guestEmail || '',
      guestPhone: bookingData.guestPhone || '',
      roomId: bookingData.roomId,
      checkIn: bookingData.checkIn,
      checkOut: bookingData.checkOut,
      totalPrice,
      paymentType: bookingData.paymentType,
      prepaymentPercentage,
    };

    const { telegramMessage, emailMessage } = formatPaymentMessage(
      telegramData,
      paymentResult.confirmationUrl
    );

    await sendTelegramMessage(telegramMessage);
    await sendEmail(bookingData.guestEmail, emailMessage);

    return {
      success: true,
      paymentUrl: paymentResult.confirmationUrl,
      bookingId,
      bookingNumber,
      paymentType: bookingData.paymentType,
      paymentAmount,
      totalPrice,
      prepaymentPercentage,
    };
  } catch (error) {
    // Откат бронирования
    if (bookingId) {
      try {
        const calendarSheet = await getSheet(CONFIG.sheets.calendar);
        const calendarData = await sheets.spreadsheets.values.get({
          spreadsheetId: CONFIG.sheetId,
          range: `${calendarSheet}!A:J`,
        });
        const data = calendarData.data.values || [];
        for (let i = data.length - 1; i >= 0; i--) {
          if (data[i][3] === bookingId) {
            await sheets.spreadsheets.values.update({
              spreadsheetId: CONFIG.sheetId,
              range: `${calendarSheet}!A${i + 1}:J${i + 1}`,
              valueInputOption: 'USER_ENTERED',
              resource: { values: [[]] },
            });
            break;
          }
        }
      } catch (e) {
        console.error('Ошибка при откате бронирования:', e);
      }
    }
    throw error;
  }
}

// Создание платежа в YooKassa
async function createYooKassaPayment(amount, bookingId, description) {
  const auth = `${process.env.YOOKASSA_SHOP_ID}:${process.env.YOOKASSA_SECRET_KEY}`;
  const booking = await getBookingDetails(bookingId);
  const customerEmail = booking?.email || 'default@example.com';

  const payload = {
    amount: {
      value: amount.toFixed(2),
      currency: 'RUB',
    },
    capture: true,
    confirmation: {
      type: 'redirect',
      return_url: CONFIG.yookassa.returnUrl,
    },
    description,
    metadata: { booking_id: bookingId },
    receipt: {
      customer: { email: customerEmail },
      items: [
        {
          description: `Бронирование номера (ID: ${bookingId})`,
          quantity: '1',
          amount: { value: amount.toFixed(2), currency: 'RUB' },
          vat_code: '1',
          payment_mode: 'full_payment',
          payment_subject: 'service',
        },
      ],
    },
  };

  try {
    const response = await axios.post(`${CONFIG.yookassa.apiUrl}payments`, payload, {
      headers: {
        Authorization: 'Basic ' + Buffer.from(auth).toString('base64'),
        'Idempotence-Key': uuidv4(),
        'Content-Type': 'application/json',
      },
    });

    return {
      id: response.data.id,
      status: response.data.status,
      confirmationUrl: response.data.confirmation.confirmation_url,
    };
  } catch (error) {
    console.error('Ошибка в createYooKassaPayment:', error);
    throw error;
  }
}

// Отправка сообщения в Telegram
async function sendTelegramMessage(message) {
  try {
    const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const payload = {
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'HTML',
    };

    const response = await axios.post(url, payload);
    if (!response.data.ok) {
      console.error('Ошибка отправки в Telegram:', response.data);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Ошибка при отправке в Telegram:', error);
    return false;
  }
}

// Отправка email
async function sendEmail(to, message) {
  try {
    await transporter.sendMail({
      from: CONFIG.email.from,
      to,
      subject: CONFIG.email.subject,
      text: message,
    });
    return true;
  } catch (error) {
    console.error('Ошибка отправки email:', error);
    return false;
  }
}

// Форматирование сообщения о платеже
function formatPaymentMessage(bookingData, paymentUrl) {
  const checkInDate = new Date(bookingData.checkIn).toLocaleDateString('ru-RU');
  const checkOutDate = new Date(bookingData.checkOut).toLocaleDateString('ru-RU');
  const paymentTypeText =
    bookingData.paymentType === 'prepayment'
      ? `Предоплата ${bookingData.prepaymentPercentage * 100}%`
      : 'Полная оплата';

  const telegramMessage = `🏨 <b>Новое бронирование!</b>

📝 <b>Номер брони:</b> ${bookingData.bookingNumber}
👤 <b>Гость:</b> ${bookingData.guestName}
📧 <b>Email:</b> ${bookingData.email}
📱 <b>Телефон:</b> ${bookingData.guestPhone}
🏠 <b>Номер:</b> ${bookingData.roomId}
📅 <b>Заезд:</b> ${checkInDate}
📅 <b>Выезд:</b> ${checkOutDate}
💰 <b>Общая стоимость:</b> ${bookingData.totalPrice} ₽
💳 <b>Тип оплаты:</b> ${paymentTypeText}

🔗 <a href="${paymentUrl}">Ссылка на оплату</a>`;

  const emailMessage = `Новое бронирование!

Номер брони: ${bookingData.bookingNumber}
Гость: ${bookingData.guestName}
Email: ${bookingData.email}
Телефон: ${bookingData.guestPhone}
Номер: ${bookingData.roomId}
Заезд: ${checkInDate}
Выезд: ${checkOutDate}
Общая стоимость: ${bookingData.totalPrice} ₽
Тип оплаты: ${paymentTypeText}

Ссылка на оплату: ${paymentUrl}

Данная ссылка действительна в течение часа, если у вас возникли проблемы с оплатой или вы не успели оплатить, свяжитесь пожалуйста с администратором +7 (908) 068-60-60, для проведения оплаты`;

  return { telegramMessage, emailMessage };
}

// Генерация номера брони
function generateBookingNumber() {
  const min = 100000000;
  const max = 999999999;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Проверка пересечения дат
function isDateOverlap(checkIn, checkOut, bookedFrom, bookedTo) {
  try {
    const ci = new Date(checkIn);
    const co = new Date(checkOut);
    const bf = new Date(bookedFrom);
    const bt = new Date(bookedTo);
    return ci < bt && co > bf;
  } catch (e) {
    console.error('Ошибка в isDateOverlap:', e);
    return true;
  }
}

// Получение данных бронирования
async function getBookingDetails(bookingId) {
  try {
    const bookingsSheet = await getSheet(CONFIG.sheets.bookings);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: CONFIG.sheetId,
      range: `${bookingsSheet}!A:P`,
    });
    const data = response.data.values || [];

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === bookingId) {
        return {
          email: data[i][4],
          bookingNumber: data[i][1],
          guestName: data[i][3],
          guestPhone: data[i][5],
          roomId: data[i][2],
          checkIn: data[i][6],
          checkOut: data[i][7],
          totalPrice: parseFloat(data[i][12]) || 0,
          paymentType: data[i][13],
          prepaymentPercentage: parseFloat(data[i][14]) || 0,
          fullPrice: parseFloat(data[i][15]) || 0,
        };
      }
    }
    return null;
  } catch (error) {
    console.error('Ошибка в getBookingDetails:', error);
    throw error;
  }
}

module.exports = {
  createBooking,
  getAvailableRooms,
  isRoomAvailable,
  sendTelegramMessage,
  createYooKassaPayment,
  getBookingDetails,
};