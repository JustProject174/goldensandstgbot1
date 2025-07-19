require("dotenv").config();

module.exports = {
    BOT_TOKEN: process.env.BOT_TOKEN,
    KNOWLEDGE_BASE_FILE: "knowledge_base.txt",
    ADMIN_ANSWERS_FILE: "admin_answers.txt",
    ADMIN_CHAT_ID: "-1002826990012",
    // Данные номеров теперь загружаются из локального файла rooms/rooms.csv
};
