require("dotenv").config();

module.exports = {
    BOT_TOKEN: process.env.BOT_TOKEN,
    KNOWLEDGE_BASE_FILE: "knowledge_base.txt",
    ADMIN_ANSWERS_FILE: "admin_answers.txt",
    admins: [809245787],
    // Данные номеров теперь загружаются из локального файла rooms/rooms.csv
};
