require('dotenv').config();
const { Telegraf } = require('telegraf');
const cron = require('node-cron');
const { connectDB, User } = require('./database');
// ДОДАЄМО ЦЕЙ РЯДОК:
const { fetchOlxAds } = require('./parser'); 

const bot = new Telegraf(process.env.BOT_TOKEN);

// Команда /start, реєстрація в базі
bot.start(async (ctx) => {
    const chatId = ctx.chat.id;
    try {
        let user = await User.findOne({ chatId });
        
        if (!user) {
            user = new User({ 
                chatId, 
                keywords: ['інвертор', 'сонячні панелі'], 
                seenAds: [] 
            });
            await user.save();
            ctx.reply('Підключився до бази. За замовчуванням додамо слова "інвертор" та "сонячні панелі" для тесту. Команда /list щоб подивитись список ключових слів.');
        } else {
            ctx.reply('З поверненням. Парсер працює у фоні.');
        }
    } catch (err) {
        console.error(err);
        ctx.reply('Сталася помилка при підключенні до бази.');
    }
});

// Команда /add [слово]
bot.command('add', async (ctx) => {
    // Витягуємо текст після команди
    const word = ctx.message.text.split(' ').slice(1).join(' ').trim().toLowerCase();
    if (!word) return ctx.reply('Вкажіть слово. Приклад: /add акумулятор');

    try {
        // Вперше беру $addToSet, повинно запобігати щоб слово не додавалось двічі
        await User.findOneAndUpdate(
            { chatId: ctx.chat.id },
            { $addToSet: { keywords: word } }
        );
        ctx.reply(`✅ Слово "${word}" успішно додано до пошуку.`);
    } catch (error) {
        ctx.reply('Помилка при додаванні слова.');
    }
});

// /remove
bot.command('remove', async (ctx) => {
    const word = ctx.message.text.split(' ').slice(1).join(' ').trim().toLowerCase();
    if (!word) return ctx.reply('Вкажіть слово. Приклад: /remove акумулятор');

    try {
        await User.findOneAndUpdate(
            { chatId: ctx.chat.id },
            { $pull: { keywords: word } }
        );
        ctx.reply(`🗑 Слово "${word}" видалено зі списку.`);
    } catch (error) {
        ctx.reply('Помилка при видаленні слова.');
    }
});

// /list
bot.command('list', async (ctx) => {
    try {
        const user = await User.findOne({ chatId: ctx.chat.id });
        if (!user || user.keywords.length === 0) {
            return ctx.reply('Список слів наразі порожній.');
        }
        ctx.reply(`Ключові слова для пошуку на OLX:\n- ${user.keywords.join('\n- ')}`);
    } catch (error) {
        ctx.reply('Не вдалося отримати список.');
    }
});

// Запуск і підключення до БД
connectDB().then(() => {
    bot.launch();
    console.log('🤖 Телеграм-бот запущений');

    // Крон працює кожні 5 хвилин
    cron.schedule('*/1 * * * *', async () => {
        console.log('⏳ Запуск перевірки OLX...');
        
        try {
            // Отримуємо всіх користувачів з бази (в нашому випадку - тата)
            const users = await User.find();

            for (const user of users) {
                if (user.keywords.length === 0) continue;

                for (const keyword of user.keywords) {
                    console.log(`Шукаємо: ${keyword} для чату ${user.chatId}`);
                    
                    // ВИКЛИКАЄМО НАШ ПАРСЕР
                    const newAds = await fetchOlxAds(keyword);

                    for (const ad of newAds) {
                        // Якщо цього ID ще немає в масиві seenAds
                        if (!user.seenAds.includes(ad.id)) {
                            
                            // 1. Формуємо гарне повідомлення
                            const message = `🚨 <b>Нове оголошення!</b>\n\n🔍 Запит: <i>${keyword}</i>\n📦 <b>${ad.title}</b>\n💰 Ціна: ${ad.price}\n\n🔗 <a href="${ad.link}">Перейти на OLX</a>`;
                            
                            // 2. Відправляємо в Telegram (використовуємо bot.telegram, бо ctx тут немає)
                            await bot.telegram.sendMessage(user.chatId, message, { parse_mode: 'HTML' });

                            // 3. Додаємо ID в базу, щоб більше не відправляти
                            user.seenAds.push(ad.id);
                        }
                    }
                }
                
                // Очищення бази: щоб масив не ріс до безкінечності, залишаємо тільки останні 200 ID
                if (user.seenAds.length > 200) {
                    user.seenAds = user.seenAds.slice(-200);
                }
                
                // Зберігаємо оновлені дані користувача
                await user.save();
            }
            console.log('✅ Перевірка завершена.');
        } catch (error) {
            console.error('Помилка в планувальнику крону:', error);
        }
    });
});

// Завершення роботи
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
