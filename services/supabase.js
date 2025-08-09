const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function getBookingSession(chatId) {
  const { data, error } = await supabase
    .from('booking_sessions')
    .select('*')
    .eq('chat_id', chatId)
    .single();
  return { data, error };
}

async function saveBookingSession(chatId, step, data) {
  const { error } = await supabase
    .from('booking_sessions')
    .upsert({ chat_id: chatId, step, data }, { onConflict: 'chat_id' });

  if (error) {
    return { error }; // Возвращаем объект с ошибкой
  }
  return { success: true }; // Возвращаем объект при успехе
}

async function deleteBookingSession(chatId) {
  const { error } = await supabase
    .from('booking_sessions')
    .delete()
    .eq('chat_id', chatId);
  if (error) throw error;
}

module.exports = { getBookingSession, saveBookingSession, deleteBookingSession };