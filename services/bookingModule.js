const axios = require('axios');

const GAS_URL = process.env.GAS_URL || 'https://script.google.com/macros/s/AKfycbywmbK6PsGIqGEJQGEK2ix-IQXPG0TNSBXNr-19QODCRxDXWv-ntNllrh5O6X-amWwV/exec';

async function getAvailableRooms(checkIn, checkOut) {
  try {
    const response = await axios.get(`${GAS_URL}?action=get_free_rooms&from=${checkIn}&to=${checkOut}`);
    return response.data;
  } catch (error) {
    console.error('Ошибка получения доступных номеров:', error);
    throw new Error('Не удалось получить список номеров');
  }
}

async function createBooking(bookingData) {
  try {
    const response = await axios.post(GAS_URL, {
      action: 'add_manual_booking',
      bookingData: {
        roomId: bookingData.roomId,
        checkIn: bookingData.checkIn,
        checkOut: bookingData.checkOut,
        guestName: bookingData.guestName,
        guestEmail: bookingData.guestEmail,
        guestPhone: bookingData.guestPhone,
        paymentType: bookingData.paymentType || 'prepayment',
        totalPrice: bookingData.totalPrice,
        nights: bookingData.nights
      }
    });
    return response.data;
  } catch (error) {
    console.error('Ошибка создания бронирования:', error);
    throw new Error('Не удалось создать бронирование');
  }
}

async function checkPaymentStatus(bookingId) {
  try {
    const response = await axios.get(`${GAS_URL}?action=check_payment&booking_id=${bookingId}`);
    return response.data;
  } catch (error) {
    console.error('Ошибка проверки статуса платежа:', error);
    throw new Error('Не удалось проверить статус платежа');
  }
}

module.exports = {
  getAvailableRooms,
  createBooking,
  checkPaymentStatus
};