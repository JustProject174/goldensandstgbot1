require("dotenv").config();

module.exports = {
    BOT_TOKEN: process.env.BOT_TOKEN,
	SUPABASE_URL: process.env.SUPABASE_URL, // Например, "https://your-project.supabase.co"
    SUPABASE_KEY: process.env.SUPABASE_KEY, // Ваш публичный или приватный ключ
    #KNOWLEDGE_BASE_FILE: "knowledge_base.txt",
    #ADMIN_ANSWERS_FILE: "admin_answers.txt",
    ADMIN_CHAT_ID: "-1002826990012",
    // Данные номеров теперь загружаются из локального файла rooms/rooms.csv
};
