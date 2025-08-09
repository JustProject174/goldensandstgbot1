const { createClient } = require('@supabase/supabase-js');
const knowledgeBaseService = require('./knowledgeBase');
const fs = require('fs');

// Инициализация Supabase клиента
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const pendingQuestions = new Map();

// Экранирование спецсимволов
function escapeSpecialChars(text) {
    if (!text) return '';
    return text.toString()
        .replace(/\r\n/g, '\\n')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\n')
        .replace(/\t/g, '\\t')
        .trim();
}

// Восстановление спецсимволов
function unescapeSpecialChars(text) {
    if (!text) return '';
    return text.toString()
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t');
}

// Загрузка ожидающих вопросов
async function loadPendingQuestions() {
    try {
        const { data, error } = await supabase
            .from('admin_answers')
            .select('timestamp, user_id, question, answer')
            .is('answer', null);

        if (error) throw error;

        pendingQuestions.clear();
        if (data?.length > 0) {
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

// Обработка и сохранение ответов администратора
async function loadAndProcessAdminAnswers() {
    try {
        const { data, error } = await supabase
            .from('admin_answers')
            .select('id, user_id, question, answer, keywords');

        if (error) throw error;
        if (!data || data.length === 0) {
            console.log('Таблица ответов пуста');
            return;
        }

        const processedIds = [];
        const knowledgeBase = knowledgeBaseService.getKnowledgeBase();

        for (const entry of data) {
            try {
                const { id, user_id, question, answer, keywords } = entry;

                if (!answer?.trim() || !Array.isArray(keywords) || keywords.every(k => !k.trim())) {
                    console.log(`⏩ Пропущено ID ${id} — пустой ответ или ключевые слова`);
                    continue;
                }

                const exists = knowledgeBase.some(item =>
                    item.answer === answer &&
                    item.keywords.length === keywords.length &&
                    item.keywords.every(k => keywords.includes(k))
                );

                if (!exists) {
                    await knowledgeBaseService.saveToKnowledgeBase(keywords, answer);
                    console.log(`✅ Добавлен в базу знаний: ${keywords.join(', ')}`);
                } else {
                    console.log(`⚠️ Ответ ID ${id} уже существует в базе знаний — пропущен`);
                }

                processedIds.push(id);
                if (user_id) pendingQuestions.delete(user_id.toString());
            } catch (err) {
                console.error(`Ошибка в записи ID ${entry.id}:`, err);
            }
        }

        if (processedIds.length > 0) {
            const { error: deleteError } = await supabase
                .from('admin_answers')
                .delete()
                .in('id', processedIds);

            if (deleteError) console.error('Ошибка при удалении:', deleteError);
            else console.log(`🗑️ Удалены записи: ${processedIds.join(', ')}`);
        }

        console.log('✅ Обработка завершена');
    } catch (error) {
        console.error('Ошибка при обработке ответов:', error);
    }
}

// Сохранение нового вопроса
async function saveUnknownQuestion(userId, username, question) {
    if (!userId || !question) throw new Error('userId и question обязательны');

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

        if (error) throw error;

        pendingQuestions.set(stringUserId, {
            question: unescapeSpecialChars(safeQuestion),
            timestamp
        });

        console.log(`📩 Сохранен вопрос от ${userInfo}`);
    } catch (error) {
        console.error('Ошибка при сохранении вопроса:', error);
        throw error;
    }
}

// Обновление ответа
async function updateAdminAnswer(userId, answer, keywords) {
    if (!userId || !answer || !Array.isArray(keywords)) {
        throw new Error('Неверные параметры');
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

        if (error) throw error;
        if (!data || data.length === 0) throw new Error(`Не найдена запись для ${searchUserId}`);

        pendingQuestions.delete(searchUserId);
        console.log(`💾 Ответ сохранен и удалён из очереди: ${searchUserId}`);

        await loadAndProcessAdminAnswers();
    } catch (error) {
        console.error('Ошибка при сохранении ответа администратора:', error);
        throw error;
    }
}

// Удаление вопроса
async function removeQuestionFromFile(userId) {
    if (!userId) throw new Error('userId обязателен');

    try {
        const searchUserId = userId.toString();
        const { error } = await supabase
            .from('admin_answers')
            .delete()
            .eq('user_id', searchUserId);

        if (error) throw error;

        pendingQuestions.delete(searchUserId);
        console.log(`🗑️ Вопрос ${searchUserId} удалён`);
    } catch (error) {
        console.error('Ошибка при удалении:', error);
        throw error;
    }
}

// Получение очереди
function getPendingQuestions() {
    return new Map(pendingQuestions);
}

// Безопасный текст
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
    removeQuestion: removeQuestionFromFile,
    removeQuestionFromFile,
};
