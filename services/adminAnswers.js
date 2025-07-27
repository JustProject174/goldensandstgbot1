const { createClient } = require('@supabase/supabase-js');
const knowledgeBaseService = require('./knowledgeBase');

// Инициализация Supabase клиента
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const pendingQuestions = new Map();

// Функция для экранирования специальных символов
function escapeSpecialChars(text) {
    if (!text) return '';
    return text.toString()
        .replace(/\r\n/g, '\\n')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\n')
        .replace(/\t/g, '\\t')
        .trim();
}

// Функция для восстановления специальных символов
function unescapeSpecialChars(text) {
    if (!text) return '';
    return text.toString()
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t');
}

// Функция для безопасного извлечения значения
function extractValue(line, prefix) {
    if (!line || !line.startsWith(prefix)) return '';
    return line.substring(prefix.length).trim();
}

// Загрузка ожидающих вопросов из Supabase
async function loadPendingQuestions() {
    try {
        const { data, error } = await supabase
            .from('admin_answers')
            .select('timestamp, user_id, question, answer')
            .is('answer', null);

        if (error) {
            throw error;
        }

        pendingQuestions.clear();
        if (data && data.length > 0) {
            for (const entry of data) {
                if (entry.user_id && entry.question && entry.timestamp) {
                    pendingQuestions.set(entry.user_id, {
                        question: unescapeSpecialChars(entry.question),
                        timestamp: entry.timestamp
                    });
                }
            }
        }

        console.log(`Загружено ${pendingQuestions.size} ожидающих вопросов`);
    } catch (error) {
        console.error('Ошибка при загрузке ожидающих вопросов:', error);
    }
}

// Обработка ответов администраторов и добавление в базу знаний
async function loadAndProcessAdminAnswers() {
    try {
        const { data, error } = await supabase
            .from('admin_answers')
            .select('id, user_id, question, answer, keywords');

        if (error) {
            throw error;
        }

        if (!data || data.length === 0) {
            console.log('Таблица ответов администраторов пуста');
            return;
        }

        const processedIds = [];

        for (const entry of data) {
            try {
                const { id, user_id, question, answer, keywords } = entry;

                if (answer && answer.trim() && keywords && keywords.length > 0) {
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

                    processedIds.push(id);
                    if (user_id) {
                        pendingQuestions.delete(user_id.toString());
                    }
                }
            } catch (entryError) {
                console.error('Ошибка при обработке записи:', entryError);
                continue;
            }
        }

        if (processedIds.length > 0) {
            const { error: deleteError } = await supabase
                .from('admin_answers')
                .delete()
                .in('id', processedIds);

            if (deleteError) {
                console.error('Ошибка при удалении обработанных записей:', deleteError);
            }
        }

        console.log('Ответы администраторов обработаны и добавлены в базу знаний');
    } catch (error) {
        console.error('Ошибка при обработке ответов администраторов:', error);
    }
}

// Обновление ответа администратора
async function updateAdminAnswer(userId, answer, keywords) {
    if (!userId || !answer || !keywords || !Array.isArray(keywords)) {
        throw new Error('Все параметры обязательны, keywords должен быть массивом');
    }

    try {
        const safeAnswer = escapeSpecialChars(answer);
        const safeKeywords = keywords.map(k => escapeSpecialChars(k.toString()));
        const searchUserId = userId.toString();

        const { data, error } = await supabase
            .from('admin_answers')
            .update({ answer: safeAnswer, keywords: safeKeywords })
            .eq('user_id', searchUserId)
            .is('answer', null)
            .select();

        if (error) {
            throw error;
        }

        if (!data || data.length === 0) {
            throw new Error(`Запись для пользователя ${searchUserId} не найдена`);
        }

        pendingQuestions.delete(searchUserId);
        console.log(`Удален из ожидающих вопросов пользователь: ${searchUserId}`);
        console.log(`Ответ администратора для пользователя ${searchUserId} сохранен`);
    } catch (error) {
        console.error('Ошибка при сохранении ответа администратора:', error);
        throw error;
    }
}

// Сохранение неизвестного вопроса
async function saveUnknownQuestion(userId, username, question) {
    if (!userId || !question) {
        throw new Error('userId и question обязательны');
    }

    try {
        const timestamp = new Date().toISOString();
        const userInfo = username ? `@${username}` : `ID: ${userId}`;
        const safeQuestion = escapeSpecialChars(question);
        const safeUserInfo = escapeSpecialChars(userInfo);
        const stringUserId = userId.toString();

        const { error } = await supabase
            .from('admin_answers')
            .insert({
                timestamp,
                user_info: safeUserInfo,
                user_id: stringUserId,
                question: safeQuestion,
                answer: null,
                keywords: []
            });

        if (error) {
            throw error;
        }

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

// Получение ожидающих вопросов
function getPendingQuestions() {
    return new Map(pendingQuestions);
}

// Безопасный текст для Telegram
function getSafeTextForTelegram(text) {
    if (!text) return '';
    return text.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .trim();
}

// Превью вопроса
function getQuestionPreview(question, maxLength = 30) {
    if (!question) return 'Без текста';
    const safeQuestion = getSafeTextForTelegram(question);
    return safeQuestion.length > maxLength
        ? safeQuestion.substring(0, maxLength) + '...'
        : safeQuestion;
}

// Удаление вопроса
async function removeQuestionFromFile(userId) {
    if (!userId) {
        throw new Error('userId обязателен');
    }

    try {
        const searchUserId = userId.toString();
        const { error } = await supabase
            .from('admin_answers')
            .delete()
            .eq('user_id', searchUserId);

        if (error) {
            throw error;
        }

        pendingQuestions.delete(searchUserId);
        console.log(`Вопрос пользователя ${searchUserId} удален из базы и памяти`);
    } catch (error) {
        console.error('Ошибка при удалении вопроса:', error);
        throw error;
    }
}

// Инициализация
loadPendingQuestions().catch(console.error);

module.exports = {
    loadAndProcessAdminAnswers,
    saveUnknownQuestion,
    updateAdminAnswer,
    getPendingQuestions,
    loadPendingQuestions,
    getSafeTextForTelegram,
    getQuestionPreview,
    removeQuestionFromFile
};