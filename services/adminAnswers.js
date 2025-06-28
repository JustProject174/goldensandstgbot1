const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const knowledgeBaseService = require('./knowledgeBase');

const pendingQuestions = new Map();

// Уникальный разделитель записей
const ENTRY_SEPARATOR = '\n===ENTRY_END===\n';

// Функция для экранирования специальных символов
function escapeSpecialChars(text) {
    if (!text) return '';
    return text.toString()
        .replace(/\r\n/g, '\\n')  // Windows переносы
        .replace(/\n/g, '\\n')    // Unix переносы
        .replace(/\r/g, '\\n')    // Mac переносы
        .replace(/\t/g, '\\t')    // Табуляции
        .trim();
}

// Функция для восстановления специальных символов
function unescapeSpecialChars(text) {
    if (!text) return '';
    return text.toString()
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t');
}

// Функция для безопасного извлечения значения из строки
function extractValue(line, prefix) {
    if (!line || !line.startsWith(prefix)) return '';
    return line.substring(prefix.length).trim();
}

async function ensureFileExists(filePath) {
    try {
        await fs.access(filePath);
    } catch (error) {
        // Создаем директорию если не существует
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        // Создаем пустой файл
        await fs.writeFile(filePath, '', 'utf8');
    }
}

async function loadPendingQuestions() {
    try {
        await ensureFileExists(config.ADMIN_ANSWERS_FILE);
        const data = await fs.readFile(config.ADMIN_ANSWERS_FILE, 'utf8');

        if (!data.trim()) return;

        const entries = data.split(ENTRY_SEPARATOR).filter(entry => entry.trim());

        for (const entry of entries) {
            try {
                const lines = entry.split('\n').filter(line => line.trim());

                let timestamp = '';
                let userId = '';
                let question = '';
                let answer = '';

                for (const line of lines) {
                    if (line.startsWith('TIMESTAMP:')) {
                        timestamp = extractValue(line, 'TIMESTAMP:');
                    } else if (line.startsWith('USER_ID:')) {
                        userId = extractValue(line, 'USER_ID:');
                    } else if (line.startsWith('QUESTION:')) {
                        question = unescapeSpecialChars(extractValue(line, 'QUESTION:'));
                    } else if (line.startsWith('ANSWER:')) {
                        answer = unescapeSpecialChars(extractValue(line, 'ANSWER:'));
                    }
                }

                // Если ответ пустой и есть все необходимые данные, добавляем в ожидающие
                if (!answer.trim() && userId && question && timestamp) {
                    pendingQuestions.set(userId, { question, timestamp });
                } else if (answer.trim() && userId) {
                    // Если есть ответ, удаляем из ожидающих
                    pendingQuestions.delete(userId);
                }
            } catch (parseError) {
                console.error('Ошибка при парсинге записи:', parseError);
                continue;
            }
        }

        console.log(`Загружено ${pendingQuestions.size} ожидающих вопросов`);
    } catch (error) {
        console.error('Ошибка при загрузке ожидающих вопросов:', error);
    }
}

async function loadAndProcessAdminAnswers() {
    try {
        await ensureFileExists(config.ADMIN_ANSWERS_FILE);
        const data = await fs.readFile(config.ADMIN_ANSWERS_FILE, 'utf8');

        if (!data.trim()) {
            console.log('Файл ответов администраторов пуст');
            return;
        }

        const entries = data.split(ENTRY_SEPARATOR).filter(entry => entry.trim());
        const processedEntries = [];

        for (const entry of entries) {
            try {
                const lines = entry.split('\n').filter(line => line.trim());

                let question = '';
                let answer = '';
                let keywordsStr = '';
                let userId = '';

                for (const line of lines) {
                    if (line.startsWith('QUESTION:')) {
                        question = unescapeSpecialChars(extractValue(line, 'QUESTION:'));
                    } else if (line.startsWith('ANSWER:')) {
                        answer = unescapeSpecialChars(extractValue(line, 'ANSWER:'));
                    } else if (line.startsWith('KEYWORDS:')) {
                        keywordsStr = extractValue(line, 'KEYWORDS:');
                    } else if (line.startsWith('USER_ID:')) {
                        userId = extractValue(line, 'USER_ID:');
                    }
                }

                // Если есть ответ и ключевые слова
                if (answer.trim() && keywordsStr.trim()) {
                    const keywords = keywordsStr.split(',')
                        .map(k => k.trim())
                        .filter(k => k.length > 0);

                    if (keywords.length > 0) {
                        // Проверяем, не существует ли уже такой записи
                        let exists = false;
                        try {
                            const knowledgeBase = knowledgeBaseService.getKnowledgeBase();
                            exists = knowledgeBase.some(item =>
                                item.keywords.some(keyword => keywords.includes(keyword))
                            );
                        } catch (kbError) {
                            console.error('Ошибка при проверке базы знаний:', kbError);
                        }

                        if (!exists) {
                            try {
                                await knowledgeBaseService.saveToKnowledgeBase(keywords, answer);
                                console.log(`Добавлен ответ в базу знаний: ${keywords.join(', ')}`);
                                console.log(`Обновленная база знаний содержит ${knowledgeBaseService.getKnowledgeBase().length} записей`);
                            } catch (saveError) {
                                console.error('Ошибка при сохранении в базу знаний:', saveError);
                            }
                        }

                        // Удаляем из ожидающих вопросов
                        if (userId) {
                            pendingQuestions.delete(userId);
                        }
                    } else {
                        // Если ключевые слова некорректные, оставляем запись
                        processedEntries.push(entry);
                    }
                } else {
                    // Если ответа нет, оставляем запись
                    processedEntries.push(entry);
                }
            } catch (parseError) {
                console.error('Ошибка при обработке записи:', parseError);
                // Оставляем некорректную запись для ручной проверки
                processedEntries.push(entry);
            }
        }

        // Сохраняем только необработанные записи
        const remainingData = processedEntries.length > 0 
            ? processedEntries.join(ENTRY_SEPARATOR) + ENTRY_SEPARATOR
            : '';
        await fs.writeFile(config.ADMIN_ANSWERS_FILE, remainingData, 'utf8');

        console.log('Ответы администраторов обработаны и добавлены в базу знаний');
    } catch (error) {
        console.error('Ошибка при обработке ответов администраторов:', error);
    }
}

async function updateAdminAnswer(userId, answer, keywords) {
    if (!userId || !answer || !keywords || !Array.isArray(keywords)) {
        throw new Error('Все параметры обязательны, keywords должен быть массивом');
    }

    try {
        await ensureFileExists(config.ADMIN_ANSWERS_FILE);
        const data = await fs.readFile(config.ADMIN_ANSWERS_FILE, 'utf8');

        if (!data.trim()) {
            throw new Error('Файл ответов пуст');
        }

        const entries = data.split(ENTRY_SEPARATOR);
        let updated = false;

        // Приводим userId к строке для поиска
        const searchUserId = userId.toString();

        // Экранируем ответ и ключевые слова
        const safeAnswer = escapeSpecialChars(answer);
        const safeKeywords = keywords.map(k => escapeSpecialChars(k.toString()));

        for (let i = 0; i < entries.length; i++) {
            if (entries[i].includes(`USER_ID:${searchUserId}`)) {
                const lines = entries[i].split('\n');
                const updatedLines = [];

                for (const line of lines) {
                    if (line.startsWith('ANSWER:') && extractValue(line, 'ANSWER:') === '') {
                        updatedLines.push(`ANSWER:${safeAnswer}`);
                    } else if (line.startsWith('KEYWORDS:') && extractValue(line, 'KEYWORDS:') === '') {
                        updatedLines.push(`KEYWORDS:${safeKeywords.join(',')}`);
                    } else {
                        updatedLines.push(line);
                    }
                }

                entries[i] = updatedLines.join('\n');
                updated = true;
                break;
            }
        }

        if (!updated) {
            throw new Error(`Запись для пользователя ${searchUserId} не найдена`);
        }

        await fs.writeFile(config.ADMIN_ANSWERS_FILE, entries.join(ENTRY_SEPARATOR), 'utf8');

        // Удаляем из ожидающих вопросов (тоже приводим к строке)
        pendingQuestions.delete(searchUserId);

        console.log(`Удален из ожидающих вопросов пользователь: ${searchUserId}`);

        console.log(`Ответ администратора для пользователя ${searchUserId} сохранен`);
    } catch (error) {
        console.error('Ошибка при сохранении ответа администратора:', error);
        throw error;
    }
}

async function saveUnknownQuestion(userId, username, question) {
    if (!userId || !question) {
        throw new Error('userId и question обязательны');
    }

    try {
        await ensureFileExists(config.ADMIN_ANSWERS_FILE);

        const timestamp = new Date().toISOString();
        const userInfo = username ? `@${username}` : `ID: ${userId}`;

        // Приводим userId к строке для консистентности
        const stringUserId = userId.toString();

        // Экранируем специальные символы в тексте
        const safeQuestion = escapeSpecialChars(question);
        const safeUserInfo = escapeSpecialChars(userInfo);

        const entry = `TIMESTAMP:${timestamp}
USER:${safeUserInfo}
USER_ID:${stringUserId}
QUESTION:${safeQuestion}
ANSWER:
KEYWORDS:${ENTRY_SEPARATOR}`;

        await fs.appendFile(config.ADMIN_ANSWERS_FILE, entry, 'utf8');
        pendingQuestions.set(stringUserId, { 
            question: unescapeSpecialChars(safeQuestion), 
            timestamp 
        });

        console.log(`Сохранен неизвестный вопрос от пользователя ${userInfo}`);
    } catch (error) {
        console.error('Ошибка при сохранении неизвестного вопроса:', error);
        throw error;
    }
}

function getPendingQuestions() {
    return new Map(pendingQuestions);
}

// Функция для получения безопасного текста для отправки в Telegram
function getSafeTextForTelegram(text) {
    if (!text) return '';

    // Убираем или экранируем проблемные HTML символы
    return text.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .trim();
}

// Функция для получения безопасного превью вопроса
function getQuestionPreview(question, maxLength = 30) {
    if (!question) return 'Без текста';

    const safeQuestion = getSafeTextForTelegram(question);
    return safeQuestion.length > maxLength 
        ? safeQuestion.substring(0, maxLength) + '...'
        : safeQuestion;
}

// Инициализация при загрузке модуля
loadPendingQuestions().catch(console.error);

module.exports = {
    loadAndProcessAdminAnswers,
    saveUnknownQuestion,
    updateAdminAnswer,
    getPendingQuestions,
    loadPendingQuestions,
    getSafeTextForTelegram,
    getQuestionPreview
};
```

```
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const knowledgeBaseService = require('./knowledgeBase');

const pendingQuestions = new Map();

// Уникальный разделитель записей
const ENTRY_SEPARATOR = '\n===ENTRY_END===\n';

// Функция для экранирования специальных символов
function escapeSpecialChars(text) {
    if (!text) return '';
    return text.toString()
        .replace(/\r\n/g, '\\n')  // Windows переносы
        .replace(/\n/g, '\\n')    // Unix переносы
        .replace(/\r/g, '\\n')    // Mac переносы
        .replace(/\t/g, '\\t')    // Табуляции
        .trim();
}

// Функция для восстановления специальных символов
function unescapeSpecialChars(text) {
    if (!text) return '';
    return text.toString()
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t');
}

// Функция для безопасного извлечения значения из строки
function extractValue(line, prefix) {
    if (!line || !line.startsWith(prefix)) return '';
    return line.substring(prefix.length).trim();
}

async function ensureFileExists(filePath) {
    try {
        await fs.access(filePath);
    } catch (error) {
        // Создаем директорию если не существует
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        // Создаем пустой файл
        await fs.writeFile(filePath, '', 'utf8');
    }
}

async function loadPendingQuestions() {
    try {
        await ensureFileExists(config.ADMIN_ANSWERS_FILE);
        const data = await fs.readFile(config.ADMIN_ANSWERS_FILE, 'utf8');

        if (!data.trim()) return;

        const entries = data.split(ENTRY_SEPARATOR).filter(entry => entry.trim());

        for (const entry of entries) {
            try {
                const lines = entry.split('\n').filter(line => line.trim());

                let timestamp = '';
                let userId = '';
                let question = '';
                let answer = '';

                for (const line of lines) {
                    if (line.startsWith('TIMESTAMP:')) {
                        timestamp = extractValue(line, 'TIMESTAMP:');
                    } else if (line.startsWith('USER_ID:')) {
                        userId = extractValue(line, 'USER_ID:');
                    } else if (line.startsWith('QUESTION:')) {
                        question = unescapeSpecialChars(extractValue(line, 'QUESTION:'));
                    } else if (line.startsWith('ANSWER:')) {
                        answer = unescapeSpecialChars(extractValue(line, 'ANSWER:'));
                    }
                }

                // Если ответ пустой и есть все необходимые данные, добавляем в ожидающие
                if (!answer.trim() && userId && question && timestamp) {
                    pendingQuestions.set(userId, { question, timestamp });
                } else if (answer.trim() && userId) {
                    // Если есть ответ, удаляем из ожидающих
                    pendingQuestions.delete(userId);
                }
            } catch (parseError) {
                console.error('Ошибка при парсинге записи:', parseError);
                continue;
            }
        }

        console.log(`Загружено ${pendingQuestions.size} ожидающих вопросов`);
    } catch (error) {
        console.error('Ошибка при загрузке ожидающих вопросов:', error);
    }
}

async function loadAndProcessAdminAnswers() {
    try {
        await ensureFileExists(config.ADMIN_ANSWERS_FILE);
        const data = await fs.readFile(config.ADMIN_ANSWERS_FILE, 'utf8');

        if (!data.trim()) {
            console.log('Файл ответов администраторов пуст');
            return;
        }

        const entries = data.split(ENTRY_SEPARATOR).filter(entry => entry.trim());
        const processedEntries = [];

        for (const entry of entries) {
            try {
                const lines = entry.split('\n').filter(line => line.trim());

                let question = '';
                let answer = '';
                let keywordsStr = '';
                let userId = '';

                for (const line of lines) {
                    if (line.startsWith('QUESTION:')) {
                        question = unescapeSpecialChars(extractValue(line, 'QUESTION:'));
                    } else if (line.startsWith('ANSWER:')) {
                        answer = unescapeSpecialChars(extractValue(line, 'ANSWER:'));
                    } else if (line.startsWith('KEYWORDS:')) {
                        keywordsStr = extractValue(line, 'KEYWORDS:');
                    } else if (line.startsWith('USER_ID:')) {
                        userId = extractValue(line, 'USER_ID:');
                    }
                }

                // Если есть ответ и ключевые слова
                if (answer.trim() && keywordsStr.trim()) {
                    const keywords = keywordsStr.split(',')
                        .map(k => k.trim())
                        .filter(k => k.length > 0);

                    if (keywords.length > 0) {
                        // Проверяем, не существует ли уже такой записи
                        let exists = false;
                        try {
                            const knowledgeBase = knowledgeBaseService.getKnowledgeBase();
                            exists = knowledgeBase.some(item =>
                                item.keywords.some(keyword => keywords.includes(keyword))
                            );
                        } catch (kbError) {
                            console.error('Ошибка при проверке базы знаний:', kbError);
                        }

                        if (!exists) {
                            try {
                                await knowledgeBaseService.saveToKnowledgeBase(keywords, answer);
                                console.log(`Добавлен ответ в базу знаний: ${keywords.join(', ')}`);
                                console.log(`Обновленная база знаний содержит ${knowledgeBaseService.getKnowledgeBase().length} записей`);
                            } catch (saveError) {
                                console.error('Ошибка при сохранении в базу знаний:', saveError);
                            }
                        }

                        // Удаляем из ожидающих вопросов
                        if (userId) {
                            pendingQuestions.delete(userId);
                        }
                    } else {
                        // Если ключевые слова некорректные, оставляем запись
                        processedEntries.push(entry);
                    }
                } else {
                    // Если ответа нет, оставляем запись
                    processedEntries.push(entry);
                }
            } catch (parseError) {
                console.error('Ошибка при обработке записи:', parseError);
                // Оставляем некорректную запись для ручной проверки
                processedEntries.push(entry);
            }
        }

        // Сохраняем только необработанные записи
        const remainingData = processedEntries.length > 0 
            ? processedEntries.join(ENTRY_SEPARATOR) + ENTRY_SEPARATOR
            : '';
        await fs.writeFile(config.ADMIN_ANSWERS_FILE, remainingData, 'utf8');

        console.log('Ответы администраторов обработаны и добавлены в базу знаний');
    } catch (error) {
        console.error('Ошибка при обработке ответов администраторов:', error);
    }
}

async function updateAdminAnswer(userId, answer, keywords) {
    if (!userId || !answer || !keywords || !Array.isArray(keywords)) {
        throw new Error('Все параметры обязательны, keywords должен быть массивом');
    }

    try {
        await ensureFileExists(config.ADMIN_ANSWERS_FILE);
        const data = await fs.readFile(config.ADMIN_ANSWERS_FILE, 'utf8');

        if (!data.trim()) {
            throw new Error('Файл ответов пуст');
        }

        const entries = data.split(ENTRY_SEPARATOR);
        let updated = false;

        // Приводим userId к строке для поиска
        const searchUserId = userId.toString();

        // Экранируем ответ и ключевые слова
        const safeAnswer = escapeSpecialChars(answer);
        const safeKeywords = keywords.map(k => escapeSpecialChars(k.toString()));

        for (let i = 0; i < entries.length; i++) {
            if (entries[i].includes(`USER_ID:${searchUserId}`)) {
                const lines = entries[i].split('\n');
                const updatedLines = [];

                for (const line of lines) {
                    if (line.startsWith('ANSWER:') && extractValue(line, 'ANSWER:') === '') {
                        updatedLines.push(`ANSWER:${safeAnswer}`);
                    } else if (line.startsWith('KEYWORDS:') && extractValue(line, 'KEYWORDS:') === '') {
                        updatedLines.push(`KEYWORDS:${safeKeywords.join(',')}`);
                    } else {
                        updatedLines.push(line);
                    }
                }

                entries[i] = updatedLines.join('\n');
                updated = true;
                break;
            }
        }

        if (!updated) {
            throw new Error(`Запись для пользователя ${searchUserId} не найдена`);
        }

        await fs.writeFile(config.ADMIN_ANSWERS_FILE, entries.join(ENTRY_SEPARATOR), 'utf8');

        // Удаляем из ожидающих вопросов (тоже приводим к строке)
        pendingQuestions.delete(searchUserId);

        console.log(`Удален из ожидающих вопросов пользователь: ${searchUserId}`);

        console.log(`Ответ администратора для пользователя ${searchUserId} сохранен`);
    } catch (error) {
        console.error('Ошибка при сохранении ответа администратора:', error);
        throw error;
    }
}

async function saveUnknownQuestion(userId, username, question) {
    if (!userId || !question) {
        throw new Error('userId и question обязательны');
    }

    try {
        await ensureFileExists(config.ADMIN_ANSWERS_FILE);

        const timestamp = new Date().toISOString();
        const userInfo = username ? `@${username}` : `ID: ${userId}`;

        // Приводим userId к строке для консистентности
        const stringUserId = userId.toString();

        // Экранируем специальные символы в тексте
        const safeQuestion = escapeSpecialChars(question);
        const safeUserInfo = escapeSpecialChars(userInfo);

        const entry = `TIMESTAMP:${timestamp}
USER:${safeUserInfo}
USER_ID:${stringUserId}
QUESTION:${safeQuestion}
ANSWER:
KEYWORDS:${ENTRY_SEPARATOR}`;

        await fs.appendFile(config.ADMIN_ANSWERS_FILE, entry, 'utf8');
        pendingQuestions.set(stringUserId, { 
            question: unescapeSpecialChars(safeQuestion), 
            timestamp 
        });

        console.log(`Сохранен неизвестный вопрос от пользователя ${userInfo}`);
    } catch (error) {
        console.error('Ошибка при сохранении неизвестного вопроса:', error);
        throw error;
    }
}

function getPendingQuestions() {
    return new Map(pendingQuestions);
}

// Функция для получения безопасного текста для отправки в Telegram
function getSafeTextForTelegram(text) {
    if (!text) return '';

    // Убираем или экранируем проблемные HTML символы
    return text.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .trim();
}

// Функция для получения безопасного превью вопроса
function getQuestionPreview(question, maxLength = 30) {
    if (!question) return 'Без текста';

    const safeQuestion = getSafeTextForTelegram(question);
    return safeQuestion.length > maxLength 
        ? safeQuestion.substring(0, maxLength) + '...'
        : safeQuestion;
}

// Инициализация при загрузке модуля
loadPendingQuestions().catch(console.error);

module.exports = {
    loadAndProcessAdminAnswers,
    saveUnknownQuestion,
    updateAdminAnswer,
    getPendingQuestions,
    loadPendingQuestions,
    getSafeTextForTelegram,
    getQuestionPreview
};
```