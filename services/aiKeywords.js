
const { HfInference } = require('@huggingface/inference');

class AIKeywordsService {
    constructor() {
        // Используем бесплатный API Hugging Face без токена (с ограничениями)
        this.hf = new HfInference();
        this.isEnabled = true;
    }

    // Генерация ключевых слов с помощью AI
    async generateKeywords(question, answer) {
        if (!this.isEnabled) {
            return this.generateKeywordsManually(question, answer);
        }

        try {
            // Формируем промпт для генерации ключевых слов
            const prompt = `Вопрос: "${question}"
Ответ: "${answer}"

Контекст: База отдыха на озере

Задача: Создай список ключевых слов (3-7 слов) через запятую для поиска этого ответа. Ключевые слова должны быть:
- На русском языке
- Связаны с базой отдыха
- Помогать найти этот ответ при похожих вопросах
- Включать синонимы и вариации

Ключевые слова:`;

            // Используем модель для генерации текста
            const result = await this.hf.textGeneration({
                model: 'microsoft/DialoGPT-medium',
                inputs: prompt,
                parameters: {
                    max_new_tokens: 50,
                    temperature: 0.7,
                    do_sample: true,
                    return_full_text: false
                }
            });

            // Извлекаем ключевые слова из ответа
            let keywords = this.extractKeywords(result.generated_text);
            
            if (keywords.length === 0) {
                console.log('AI не смогла сгенерировать ключевые слова, используем ручной метод');
                keywords = this.generateKeywordsManually(question, answer);
            }

            console.log(`AI сгенерировала ключевые слова: ${keywords.join(', ')}`);
            return keywords;

        } catch (error) {
            console.log('Ошибка AI генерации, используем ручной метод:', error.message);
            return this.generateKeywordsManually(question, answer);
        }
    }

    // Альтернативная генерация через другую модель
    async generateKeywordsAlternative(question, answer) {
        try {
            const text = `${question} ${answer}`;
            
            // Используем модель для извлечения ключевых фраз
            const result = await this.hf.tokenClassification({
                model: 'dbmdz/bert-large-cased-finetuned-conll03-english',
                inputs: text
            });

            // Извлекаем важные слова
            const keywords = result
                .filter(token => token.score > 0.5)
                .map(token => token.word.toLowerCase())
                .filter(word => word.length > 2)
                .slice(0, 6);

            if (keywords.length > 0) {
                return keywords;
            }

            return this.generateKeywordsManually(question, answer);

        } catch (error) {
            console.log('Альтернативная AI генерация не удалась:', error.message);
            return this.generateKeywordsManually(question, answer);
        }
    }

    // Ручная генерация ключевых слов на основе анализа текста
    generateKeywordsManually(question, answer) {
        const text = `${question} ${answer}`.toLowerCase();
        
        // Словарь ключевых слов для базы отдыха
        const baseKeywords = {
            'питание': ['питание', 'еда', 'кухня', 'готовить', 'мангал'],
            'проживание': ['дом', 'комната', 'номер', 'жилье', 'размещение'],
            'цена': ['цена', 'стоимость', 'сколько', 'деньги', 'тариф'],
            'удобства': ['душ', 'туалет', 'удобства', 'ванная', 'баня'],
            'развлечения': ['развлечения', 'досуг', 'активности', 'купание'],
            'транспорт': ['трансфер', 'доехать', 'добраться', 'парковка', 'машина'],
            'услуги': ['услуги', 'сервис', 'обслуживание', 'включено']
        };

        const foundKeywords = new Set();

        // Ищем совпадения в тексте
        for (const [category, words] of Object.entries(baseKeywords)) {
            for (const word of words) {
                if (text.includes(word)) {
                    foundKeywords.add(word);
                    // Добавляем связанные слова
                    words.slice(0, 3).forEach(relatedWord => {
                        foundKeywords.add(relatedWord);
                    });
                    break;
                }
            }
        }

        // Извлекаем важные слова из вопроса и ответа
        const importantWords = this.extractImportantWords(text);
        importantWords.forEach(word => foundKeywords.add(word));

        const result = Array.from(foundKeywords).slice(0, 7);
        
        if (result.length === 0) {
            // Fallback: основные слова
            result.push('база отдыха', 'услуги', 'информация');
        }

        console.log(`Ручная генерация ключевых слов: ${result.join(', ')}`);
        return result;
    }

    // Извлечение важных слов из текста
    extractImportantWords(text) {
        // Стоп-слова для русского языка
        const stopWords = new Set([
            'и', 'в', 'на', 'с', 'по', 'для', 'от', 'до', 'из', 'у', 'о', 'об',
            'но', 'да', 'или', 'а', 'то', 'как', 'что', 'это', 'тот', 'все',
            'она', 'он', 'они', 'мы', 'вы', 'я', 'не', 'ни', 'бы', 'ли',
            'же', 'уже', 'еще', 'там', 'тут', 'где', 'куда', 'когда', 'если'
        ]);

        const words = text
            .replace(/[^\w\sа-яё]/gi, ' ')
            .split(/\s+/)
            .filter(word => 
                word.length > 3 && 
                !stopWords.has(word) && 
                /[а-яё]/.test(word)
            )
            .slice(0, 10);

        return words;
    }

    // Извлечение ключевых слов из AI ответа
    extractKeywords(text) {
        if (!text) return [];

        // Ищем ключевые слова после двоеточия или в начале строки
        const cleanText = text
            .replace(/ключевые слова:?/gi, '')
            .trim();

        const keywords = cleanText
            .split(/[,\n\r]+/)
            .map(word => word.trim().toLowerCase())
            .filter(word => 
                word.length > 2 && 
                word.length < 20 &&
                /[а-яё]/.test(word)
            )
            .slice(0, 7);

        return keywords;
    }

    // Отключить AI и использовать только ручную генерацию
    disableAI() {
        this.isEnabled = false;
        console.log('AI генерация ключевых слов отключена');
    }

    // Включить AI генерацию
    enableAI() {
        this.isEnabled = true;
        console.log('AI генерация ключевых слов включена');
    }
}

module.exports = new AIKeywordsService();
