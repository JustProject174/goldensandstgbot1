const fs = require('fs').promises;
const path = require('path');
const config = require('../config');

let knowledgeBase = [];
let fileWatcher = null;

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

        // Настраиваем автообновление файла
        setupFileWatcher();
        
        return knowledgeBase;
    } catch (error) {
        console.log('Файл базы знаний не найден, создаем начальную базу');
        return await createInitialKnowledgeBase();
    }
}

// Функция настройки отслеживания файла
function setupFileWatcher() {
    if (fileWatcher) {
        fileWatcher.close();
    }

    try {
        fileWatcher = fs.watch(config.KNOWLEDGE_BASE_FILE, async (eventType, filename) => {
            if (eventType === 'change') {
                console.log('Обнаружены изменения в файле базы знаний, перезагружаем...');
                await loadKnowledgeBase();
            }
        });
        console.log('Автообновление базы знаний настроено');
    } catch (error) {
        console.error('Ошибка настройки автообновления:', error);
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

// Функция для получения корня слова (убираем последние 2 символа если слово длиннее 4 символов)
function getWordRoot(word) {
    if (word.length <= 4) {
        return word;
    }
    return word.slice(0, -2);
}

function findAnswerInKnowledgeBase(message) {
    const lowerMessage = message.toLowerCase();
    
    // Убираем знаки препинания и лишние пробелы
    const cleanMessage = lowerMessage.replace(/[^\w\sа-яё]/gi, ' ').replace(/\s+/g, ' ').trim();
    const messageWords = cleanMessage.split(' ').filter(word => word.length > 2); // Исключаем слова длиной меньше 3 символов
    
    // Если в сообщении меньше 1 значимого слова, возвращаем null
    if (messageWords.length < 1) {
        console.log(`Сообщение "${message}" не содержит значимых слов`);
        return null;
    }
    
    let bestMatch = null;
    let maxMatches = 0;
    let maxRelevanceScore = 0;
    
    for (const item of knowledgeBase) {
        // Пропускаем записи без ключевых слов или ответов
        if (!item.keywords || item.keywords.length === 0 || !item.answer || item.answer.trim() === '') {
            continue;
        }
        
        let matchCount = 0;
        let relevanceScore = 0;
        const matchedKeywords = [];
        
        // Подсчитываем количество совпадений с ключевыми словами
        for (const keyword of item.keywords) {
            if (!keyword || keyword.trim() === '') continue;
            
            const cleanKeyword = keyword.toLowerCase().trim();
            let keywordMatched = false;
            let currentRelevance = 0;
            
            // Точное совпадение ключевого слова (максимальная релевантность)
            if (cleanMessage.includes(cleanKeyword)) {
                matchCount++;
                matchedKeywords.push(cleanKeyword);
                keywordMatched = true;
                currentRelevance = cleanKeyword.length * 3; // Точное совпадение важнее
            } else {
                // Проверяем совпадение частей слов и корней
                const keywordWords = cleanKeyword.split(' ').filter(word => word.length > 2);
                
                for (const keywordWord of keywordWords) {
                    // Пропускаем очень короткие слова для частичного совпадения
                    if (keywordWord.length < 4) continue;
                    
                    for (const messageWord of messageWords) {
                        // Проверяем точное включение части слова (минимум 4 символа)
                        if (keywordWord.length >= 4 && messageWord.length >= 4) {
                            if (messageWord.includes(keywordWord) || keywordWord.includes(messageWord)) {
                                if (!keywordMatched) {
                                    matchCount++;
                                    matchedKeywords.push(cleanKeyword);
                                    keywordMatched = true;
                                    currentRelevance = Math.min(keywordWord.length, messageWord.length) * 2;
                                }
                                break;
                            }
                        }
                        
                        // Проверяем совпадение корней слов (убираем последние 2 символа)
                        if (!keywordMatched && keywordWord.length > 4 && messageWord.length > 4) {
                            const keywordRoot = getWordRoot(keywordWord);
                            const messageRoot = getWordRoot(messageWord);
                            
                            if (keywordRoot === messageRoot || 
                                messageWord.includes(keywordRoot) || 
                                keywordWord.includes(messageRoot)) {
                                matchCount++;
                                matchedKeywords.push(cleanKeyword + ' (корень)');
                                keywordMatched = true;
                                currentRelevance = Math.min(keywordRoot.length, messageRoot.length);
                                break;
                            }
                        }
                    }
                    if (keywordMatched) break;
                }
            }
            
            relevanceScore += currentRelevance;
        }
        
        // Требуем минимум 1 совпадение и учитываем релевантность
        if (matchCount >= 1) {
            // Отдаем предпочтение записям с большим количеством совпадений
            // или с более высокой релевантностью при равном количестве совпадений
            if (matchCount > maxMatches || 
                (matchCount === maxMatches && relevanceScore > maxRelevanceScore)) {
                maxMatches = matchCount;
                maxRelevanceScore = relevanceScore;
                bestMatch = {
                    answer: item.answer,
                    matchedKeywords: matchedKeywords,
                    matchCount: matchCount,
                    relevanceScore: relevanceScore
                };
            }
        }
    }
    
    if (bestMatch) {
        console.log(`Найдено совпадение для "${message}" по ${bestMatch.matchCount} ключевым словам: ${bestMatch.matchedKeywords.join(', ')} (релевантность: ${bestMatch.relevanceScore})`);
        return bestMatch.answer;
    }
    
    console.log(`Не найдено совпадений для сообщения: "${message}"`);
    return null;
}

// Функция для корректного завершения работы
function closeFileWatcher() {
    if (fileWatcher) {
        fileWatcher.close();
        fileWatcher = null;
        console.log('Автообновление базы знаний отключено');
    }
}

module.exports = {
    loadKnowledgeBase,
    saveToKnowledgeBase,
    findAnswerInKnowledgeBase,
    getKnowledgeBase: () => knowledgeBase,
    closeFileWatcher
};