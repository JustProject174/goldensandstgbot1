const fs = require("fs").promises;
const path = require("path");
const config = require("../config");
const natural = require("natural");

let knowledgeBase = [];
let fileWatcher = null;
let isLoading = false;

// Инициализация Natural.js
const TfIdf = natural.TfIdf;
const tfidf = new TfIdf();
let semanticIndex = [];

// Функция для создания семантического индекса
function buildSemanticIndex() {
    // Очищаем существующий индекс
    tfidf.documents = [];
    semanticIndex = [];

    knowledgeBase.forEach((item, index) => {
        if (item.answer && item.answer.trim()) {
            // Создаем текст для индексации: ключевые слова + ответ
            const indexText = `${item.keywords.join(" ")} ${item.answer}`;

            // Добавляем в TF-IDF
            tfidf.addDocument(indexText);

            // Сохраняем связь между индексом и записью
            semanticIndex.push({
                originalIndex: index,
                text: indexText,
                item: item,
            });
        }
    });

    console.log(
        `Семантический индекс построен для ${semanticIndex.length} записей`,
    );
}

// Функция семантического поиска
function semanticSearch(query) {
    if (semanticIndex.length === 0) {
        console.log("Семантический индекс пуст");
        return null;
    }

    // Получаем TF-IDF scores для запроса
    const scores = [];

    tfidf.tfidfs(query, (i, measure) => {
        if (measure > 0) {
            scores.push({
                index: i,
                score: measure,
                item: semanticIndex[i],
            });
        }
    });

    // Сортируем по релевантности
    scores.sort((a, b) => b.score - a.score);

    if (scores.length > 0) {
        const bestMatch = scores[0];
        console.log(
            `Семантический поиск: найдено совпадение с релевантностью ${bestMatch.score.toFixed(4)}`,
        );

        // Возвращаем лучший результат, если релевантность достаточна
        if (bestMatch.score > 43.0) {
            // Устанавливаем порог 50 для семантического поиска
            return bestMatch.item.item.answer;
        }
    }

    console.log("Семантический поиск: подходящих результатов не найдено");
    return null;
}

async function loadKnowledgeBase() {
    // Предотвращаем множественные одновременные загрузки
    if (isLoading) {
        console.log("База знаний уже загружается, пропускаем...");
        return knowledgeBase;
    }

    isLoading = true;

    try {
        const data = await fs.readFile(config.KNOWLEDGE_BASE_FILE, "utf8");
        const lines = data.split("\n");

        knowledgeBase = [];

        let i = 0;
        while (i < lines.length) {
            if (lines[i].startsWith("KEYWORDS:")) {
                const keywords = lines[i]
                    .replace("KEYWORDS:", "")
                    .split(",")
                    .map((k) => k.trim());
                i++;

                let answerLines = [];
                while (i < lines.length && !lines[i].startsWith("KEYWORDS:")) {
                    if (lines[i].startsWith("ANSWER:")) {
                        answerLines.push(
                            lines[i].replace("ANSWER:", "").trim(),
                        );
                    } else {
                        answerLines.push(lines[i]);
                    }
                    i++;
                }

                const answer = answerLines.join("\n").trim();
                knowledgeBase.push({ keywords, answer });
            } else {
                i++;
            }
        }

        console.log(`Загружено ${knowledgeBase.length} записей из базы знаний`);

        // Строим семантический индекс после загрузки
        buildSemanticIndex();

        // Настраиваем автообновление файла только если еще не настроено
        if (!fileWatcher) {
            setupFileWatcher();
        }

        isLoading = false;
        return knowledgeBase;
    } catch (error) {
        console.log("Файл базы знаний не найден, создаем начальную базу");
        const result = await createInitialKnowledgeBase();
        isLoading = false;
        return result;
    }
}

// Функция настройки отслеживания файла
let reloadTimeout = null;

function setupFileWatcher() {
    if (fileWatcher) {
        fileWatcher.close();
    }

    try {
        fileWatcher = require("fs").watch(
            config.KNOWLEDGE_BASE_FILE,
            async (eventType, filename) => {
                if (eventType === "change" && !isLoading) {
                    // Используем debouncing чтобы избежать множественных перезагрузок
                    if (reloadTimeout) {
                        clearTimeout(reloadTimeout);
                    }

                    reloadTimeout = setTimeout(async () => {
                        console.log(
                            "Обнаружены изменения в файле базы знаний, перезагружаем...",
                        );
                        await loadKnowledgeBase();
                    }, 1000); // Ждем 1 секунду перед перезагрузкой
                }
            },
        );
        console.log("Автообновление базы знаний настроено");
    } catch (error) {
        console.error("Ошибка настройки автообновления:", error);
    }
}

async function createInitialKnowledgeBase() {
    console.log("Создаем начальную базу знаний...");
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

    await fs.writeFile(config.KNOWLEDGE_BASE_FILE, initialData, "utf8");
    console.log("Начальная база знаний создана");

    // Парсим данные напрямую вместо рекурсивного вызова loadKnowledgeBase
    const lines = initialData.split("\n");
    knowledgeBase = [];

    let i = 0;
    while (i < lines.length) {
        if (lines[i].startsWith("KEYWORDS:")) {
            const keywords = lines[i]
                .replace("KEYWORDS:", "")
                .split(",")
                .map((k) => k.trim());
            i++;

            let answerLines = [];
            while (i < lines.length && !lines[i].startsWith("KEYWORDS:")) {
                if (lines[i].startsWith("ANSWER:")) {
                    answerLines.push(lines[i].replace("ANSWER:", "").trim());
                } else {
                    answerLines.push(lines[i]);
                }
                i++;
            }

            const answer = answerLines.join("\n").trim();
            knowledgeBase.push({ keywords, answer });
        } else {
            i++;
        }
    }

    console.log(`Начальная база содержит ${knowledgeBase.length} записей`);

    // Строим семантический индекс для начальной базы
    buildSemanticIndex();

    return knowledgeBase;
}

async function saveToKnowledgeBase(keywords, answer) {
    const keywordsStr = keywords.join(",");
    const newEntry = `\nKEYWORDS:${keywordsStr}\nANSWER:${answer}`;

    await fs.appendFile(config.KNOWLEDGE_BASE_FILE, newEntry, "utf8");

    // Перезагружаем базу знаний чтобы обновить память
    await loadKnowledgeBase();
    console.log("Новый ответ добавлен в базу знаний и база перезагружена");
    return knowledgeBase;
}

// Функция для получения корня слова (убираем последние 2 символа если слово длиннее 4 символов)
function getWordRoot(word) {
    if (word.length <= 4) {
        return word;
    }
    return word.slice(0, -2);
}

// Оригинальная функция поиска по ключевым словам с добавлением расчета релевантности
function findAnswerByKeywords(message) {
    const lowerMessage = message.toLowerCase();

    // Убираем знаки препинания и лишние пробелы
    const cleanMessage = lowerMessage
        .replace(/[^\w\sа-яё]/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    const messageWords = cleanMessage
        .split(" ")
        .filter((word) => word.length > 3); // Исключаем слова длиной меньше 3 символов

    // Если в сообщении меньше 1 значимого слова, возвращаем null
    if (messageWords.length < 2) {
        console.log(`Сообщение "${message}" не содержит значимых слов`);
        return { answer: null, relevance: 0 };
    }

    let bestMatch = null;
    let maxMatches = 0;
    let maxRelevanceScore = 0;

    for (const item of knowledgeBase) {
        // Пропускаем записи без ключевых слов или ответов
        if (
            !item.keywords ||
            item.keywords.length === 0 ||
            !item.answer ||
            item.answer.trim() === ""
        ) {
            continue;
        }

        let matchCount = 0;
        let relevanceScore = 0;
        const matchedKeywords = [];

        // Подсчитываем количество совпадений с ключевыми словами
        for (const keyword of item.keywords) {
            if (!keyword || keyword.trim() === "") continue;

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
                const keywordWords = cleanKeyword
                    .split(" ")
                    .filter((word) => word.length > 2);

                for (const keywordWord of keywordWords) {
                    // Пропускаем очень короткие слова для частичного совпадения
                    if (keywordWord.length < 4) continue;

                    for (const messageWord of messageWords) {
                        // Проверяем точное включение части слова (минимум 4 символа)
                        if (
                            keywordWord.length >= 4 &&
                            messageWord.length >= 4
                        ) {
                            if (
                                messageWord.includes(keywordWord) ||
                                keywordWord.includes(messageWord)
                            ) {
                                if (!keywordMatched) {
                                    matchCount++;
                                    matchedKeywords.push(cleanKeyword);
                                    keywordMatched = true;
                                    currentRelevance =
                                        Math.min(
                                            keywordWord.length,
                                            messageWord.length,
                                        ) * 2;
                                }
                                break;
                            }
                        }

                        // Проверяем совпадение корней слов (убираем последние 2 символа)
                        if (
                            !keywordMatched &&
                            keywordWord.length > 4 &&
                            messageWord.length > 4
                        ) {
                            const keywordRoot = getWordRoot(keywordWord);
                            const messageRoot = getWordRoot(messageWord);

                            // Добавляем проверку минимальной длины корня для избежания ложных совпадений
                            if (
                                keywordRoot.length >= 4 &&
                                messageRoot.length >= 4 &&
                                (keywordRoot === messageRoot ||
                                    messageWord.includes(keywordRoot) ||
                                    keywordWord.includes(messageRoot))
                            ) {
                                matchCount++;
                                matchedKeywords.push(
                                    cleanKeyword + " (корень)",
                                );
                                keywordMatched = true;
                                currentRelevance =
                                    Math.min(
                                        keywordRoot.length,
                                        messageRoot.length,
                                    ) * 0.7; // Понижаем вес корневых совпадений
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
            if (
                matchCount > maxMatches ||
                (matchCount === maxMatches &&
                    relevanceScore > maxRelevanceScore)
            ) {
                maxMatches = matchCount;
                maxRelevanceScore = relevanceScore;
                bestMatch = {
                    answer: item.answer,
                    matchedKeywords: matchedKeywords,
                    matchCount: matchCount,
                    relevanceScore: relevanceScore,
                };
            }
        }
    }

    if (bestMatch) {
        // Рассчитываем процент релевантности
        // Используем соотношение совпадений к общему количеству слов в запросе
        const basePercent =
            (bestMatch.matchCount / Math.max(1, messageWords.length)) * 33;

        // Бонус за точность совпадений (качество совпадений)
        const accuracyBonus = Math.min(
            20,
            bestMatch.relevanceScore / Math.max(1, bestMatch.matchCount),
        );

        const relevancePercent = Math.min(100, basePercent + accuracyBonus);

        console.log(
            `Найдено совпадение по ключевым словам для "${message}" по ${bestMatch.matchCount} ключевым словам: ${bestMatch.matchedKeywords.join(", ")} (релевантность: ${bestMatch.relevanceScore}, процент: ${relevancePercent.toFixed(1)}%)`,
        );

        return {
            answer: bestMatch.answer,
            relevance: relevancePercent,
        };
    }

    console.log(
        `Не найдено совпадений по ключевым словам для сообщения: "${message}"`,
    );
    return { answer: null, relevance: 0 };
}

// Основная функция поиска с трехуровневой системой
function findAnswerInKnowledgeBase(message) {
    console.log(`Начинаем поиск для сообщения: "${message}"`);

    // === ДОБАВЛЯЕМ ПРОВЕРКУ НА КОРОТКИЙ ВОПРОС ===
    // Убираем знаки препинания и лишние пробелы
    const cleanMessage = message
        .replace(/[^\w\sа-яё]/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    const messageWords = cleanMessage.split(" ").filter((w) => w.length > 0);

    if (messageWords.length <= 2) {
        console.log("Вопрос слишком короткий для автоответа");
        // Вернуть null — передать админу, либо строку-отказ
        return "Пожалуйста, уточните ваш вопрос, он слишком короткий.";
        // return null; // <- если хотите передавать админу
    }

    // 1. Семантический поиск через Natural.js
    console.log("Этап 1: Семантический поиск...");
    const semanticResult = semanticSearch(message);
    if (semanticResult) {
        console.log("Найден ответ через семантический поиск");
        return semanticResult;
    }

    // 2. Поиск по ключевым словам
    console.log("Этап 2: Поиск по ключевым словам...");
    const keywordResult = findAnswerByKeywords(message);
    if (keywordResult.answer) {
        // Проверяем релевантность
        if (keywordResult.relevance >= 50) {
            console.log(
                `Найден ответ по ключевым словам с релевантностью ${keywordResult.relevance.toFixed(1)}%`,
            );
            return keywordResult.answer;
        } else {
            console.log(
                `Релевантность ${keywordResult.relevance.toFixed(1)}% ниже порога 60%, передаем администратору`,
            );
            // 3. Передача администратору
            return null; // Возвращаем null, что означает передачу администратору
        }
    }

    // 3. Если ничего не найдено - передаем администратору
    console.log("Этап 3: Передача администратору - ответ не найден");
    return null;
}

// Функция для корректного завершения работы
function closeFileWatcher() {
    if (fileWatcher) {
        fileWatcher.close();
        fileWatcher = null;
        console.log("Автообновление базы знаний отключено");
    }
}

module.exports = {
    loadKnowledgeBase,
    saveToKnowledgeBase,
    findAnswerInKnowledgeBase,
    getKnowledgeBase: () => knowledgeBase,
    closeFileWatcher,
};
