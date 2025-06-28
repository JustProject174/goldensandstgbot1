const fs = require('fs').promises;
const path = require('path');
const config = require('../config');

let knowledgeBase = [];

async function loadKnowledgeBase() {
    try {
        const data = await fs.readFile(config.KNOWLEDGE_BASE_FILE, 'utf8');
        const lines = data.split('\n');

        knowledgeBase = [];

        let i = 0;
        while (i < lines.length) {
            if (lines[i].startsWith('KEYWORDS:')) {
                const keywords = lines[i].replace('KEYWORDS:', '').split(',').map(k => k.trim());
                i++;

                let answerLines = [];
                while (i < lines.length && !lines[i].startsWith('KEYWORDS:')) {
                    if (lines[i].startsWith('ANSWER:')) {
                        answerLines.push(lines[i].replace('ANSWER:', '').trim());
                    } else {
                        answerLines.push(lines[i]);
                    }
                    i++;
                }

                const answer = answerLines.join('\n').trim();
                knowledgeBase.push({ keywords, answer });
            } else {
                i++;
            }
        }

        console.log(`Загружено ${knowledgeBase.length} записей из базы знаний`);

        // Выводим отладочную информацию о записях
        knowledgeBase.forEach((item, index) => {
            console.log(`Запись ${index + 1}: ключевые слова = [${item.keywords.join(', ')}], есть ответ = ${!!item.answer && item.answer.trim() !== ''}`);
        });

        return knowledgeBase;
    } catch (error) {
        console.log('Файл базы знаний не найден, создаем начальную базу');
        return await createInitialKnowledgeBase();
    }
}

async function createInitialKnowledgeBase() {
    const initialData = `KEYWORDS:цена,стоимость,сколько,деньги
ANSWER:💰 Цены на размещение:

🏠 КОМФОРТ
• Дом №8 (4 чел.) — от 9999₽
• Дом №9/10 (6 чел.) — от 10999₽
• Дом №14 (до 10+ чел.) — от 21999₽

🛏️ ЭКОНОМ
• Комната (4 чел.) — от 4999₽
• Комната (5 чел.) — от 5499₽

👶 Дети до 5 лет — бесплатно

KEYWORDS:душ,туалет,удобства,ванная
ANSWER:🚿 Удобства:
• Душа нет, но есть русские бани на дровах
• Удобства на улице
• Большой дачный туалет на территории

💧 База в заповедной зоне, поэтому центральной канализации нет

KEYWORDS:развлечения,что делать,досуг,активности
ANSWER:🏖 Развлечения:
• Купание в озере
• Русская баня с парением ❄️
• Прокат:
  - Сапборд — 1200₽/час
  - Байдарка
  - Лодка
• Мангальные зоны включены в стоимость!

KEYWORDS:парковка,машина,авто,стоянка
ANSWER:🚗 Парковка:
• Легковой авто — 500₽/сутки
• Газель — 1000₽/сутки

📍 Возможен заезд на автомобиле

KEYWORDS:трансфер,как добраться,доехать
ANSWER:🚖 Трансфер и проезд:
📍 Координаты: 55.1881079369311, 60.05969764417703

• Индивидуальный трансфер - уточняйте стоимость
• Групповой трансфер - уточняйте стоимость

Для заказа трансфера напишите "трансфер"`;

    await fs.writeFile(config.KNOWLEDGE_BASE_FILE, initialData, 'utf8');
    return await loadKnowledgeBase();
}

async function saveToKnowledgeBase(keywords, answer) {
    const keywordsStr = keywords.join(',');
    const newEntry = `\nKEYWORDS:${keywordsStr}\nANSWER:${answer}`;

    await fs.appendFile(config.KNOWLEDGE_BASE_FILE, newEntry, 'utf8');

    // Перезагружаем базу знаний чтобы обновить память
    await loadKnowledgeBase();
    console.log('Новый ответ добавлен в базу знаний и база перезагружена');
    return knowledgeBase;
}

function findAnswerInKnowledgeBase(message) {
    const lowerMessage = message.toLowerCase();

    // Убираем знаки препинания и лишние пробелы
    const cleanMessage = lowerMessage.replace(/[^\w\sа-яё]/gi, ' ').replace(/\s+/g, ' ').trim();
    const messageWords = cleanMessage.split(' ').filter(word => word.length > 1); // Исключаем слова длиной 1 символ

    // Если в сообщении меньше 2 слов, возвращаем null
    if (messageWords.length < 2) {
        console.log(`Сообщение "${message}" содержит менее 2 значимых слов`);
        return null;
    }

    let bestMatch = null;
    let maxMatches = 0;

    for (const item of knowledgeBase) {
        // Пропускаем записи без ключевых слов или ответов
        if (!item.keywords || item.keywords.length === 0 || !item.answer || item.answer.trim() === '') {
            continue;
        }

        let matchCount = 0;
        const matchedKeywords = [];

        // Подсчитываем количество совпадений с ключевыми словами
        for (const keyword of item.keywords) {
            if (!keyword || keyword.trim() === '') continue;

            const cleanKeyword = keyword.toLowerCase().trim();
            let keywordMatched = false;

            // Точное совпадение ключевого слова
            if (cleanMessage.includes(cleanKeyword)) {
                matchCount++;
                matchedKeywords.push(cleanKeyword);
                keywordMatched = true;
            } else {
                // Проверяем совпадение частей слов
                for (const keywordWord of keywordWords) {
                    for (const messageWord of messageWords) {
                        // Проверяем включение части слова (минимум 3 символа)
                        if (keywordWord.length >= 3 && messageWord.length >= 3) {
                            if (messageWord.includes(keywordWord) || keywordWord.includes(messageWord)) {
                                if (!keywordMatched) {
                                    matchCount++;
                                    matchedKeywords.push(cleanKeyword);
                                    keywordMatched = true;
                                }
                                break;
                            }

                            // Проверяем частичное совпадение с различием в 2 последних буквах
                            if (keywordWord.length >= 4 && messageWord.length >= 4) {
                                const keywordBase = keywordWord.slice(0, -2);
                                const messageBase = messageWord.slice(0, -2);

                                // Если основы слов совпадают (без последних 2 букв)
                                if (keywordBase.length >= 3 && keywordBase === messageBase) {
                                    if (!keywordMatched) {
                                        matchCount++;
                                        matchedKeywords.push(cleanKeyword);
                                        keywordMatched = true;
                                    }
                                    break;
                                }

                                // Также проверяем обратное направление
                                if (messageBase.length >= 3 && messageWord.slice(0, -2) === keywordWord.slice(0, -2)) {
                                    if (!keywordMatched) {
                                        matchCount++;
                                        matchedKeywords.push(cleanKeyword);
                                        keywordMatched = true;
                                    }
                                    break;
                                }
                            }
                        }
                    }
                    if (keywordMatched) break;
                }
            }
        }

        // Требуем минимум 2 совпадения
        if (matchCount >= 2 && matchCount > maxMatches) {
            maxMatches = matchCount;
            bestMatch = {
                answer: item.answer,
                matchedKeywords: matchedKeywords,
                matchCount: matchCount
            };
        }
    }

    if (bestMatch) {
        console.log(`Найдено совпадение для "${message}" по ${bestMatch.matchCount} ключевым словам: ${bestMatch.matchedKeywords.join(', ')}`);
        return bestMatch.answer;
    }

    console.log(`Не найдено совпадений для сообщения: "${message}" (требуется минимум 2 совпадения)`);
    return null;
}

module.exports = {
    loadKnowledgeBase,
    saveToKnowledgeBase,
    findAnswerInKnowledgeBase,
    getKnowledgeBase: () => knowledgeBase
};