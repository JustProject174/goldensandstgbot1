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
    knowledgeBase.push({ keywords, answer });
    console.log('Новый ответ добавлен в базу знаний');
    return knowledgeBase;
}

function findAnswerInKnowledgeBase(message) {
    const lowerMessage = message.toLowerCase();
    
    // Убираем знаки препинания и лишние пробелы
    const cleanMessage = lowerMessage.replace(/[^\w\sа-яё]/gi, ' ').replace(/\s+/g, ' ').trim();
    
    for (const item of knowledgeBase) {
        // Пропускаем записи без ключевых слов или ответов
        if (!item.keywords || item.keywords.length === 0 || !item.answer || item.answer.trim() === '') {
            continue;
        }
        
        const hasKeyword = item.keywords.some(keyword => {
            if (!keyword || keyword.trim() === '') return false;
            
            const cleanKeyword = keyword.toLowerCase().trim();
            
            // Точное совпадение
            if (cleanMessage.includes(cleanKeyword)) {
                return true;
            }
            
            // Проверяем совпадение отдельных слов
            const messageWords = cleanMessage.split(' ');
            const keywordWords = cleanKeyword.split(' ');
            
            return keywordWords.every(keywordWord => 
                messageWords.some(messageWord => 
                    messageWord.includes(keywordWord) || keywordWord.includes(messageWord)
                )
            );
        });
        
        if (hasKeyword) {
            console.log(`Найдено совпадение для "${message}" по ключевым словам: ${item.keywords.join(', ')}`);
            return item.answer;
        }
    }
    
    console.log(`Не найдено совпадений для сообщения: "${message}"`);
    return null;
}

module.exports = {
    loadKnowledgeBase,
    saveToKnowledgeBase,
    findAnswerInKnowledgeBase,
    getKnowledgeBase: () => knowledgeBase
};