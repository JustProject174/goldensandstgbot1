const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

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
  if (error) throw error;
}

async function deleteBookingSession(chatId) {
  const { error } = await supabase
    .from('booking_sessions')
    .delete()
    .eq('chat_id', chatId);
  if (error) throw error;
}

module.exports = { getBookingSession, saveBookingSession, deleteBookingSession };