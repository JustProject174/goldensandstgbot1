const winston = require('winston');
const fs = require('fs');
const path = require('path');

// Создание папки logs, если она не существует
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.json()
    ),
    transports: [
        // Логи ошибок в файл error.log
        new winston.transports.File({ filename: path.join(logsDir, 'error.log'), level: 'error' }),
        // Все логи (info и выше) в файл app.log
        new winston.transports.File({ filename: path.join(logsDir, 'app.log') }),
        // Вывод в консоль для отладки
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

module.exports = logger;