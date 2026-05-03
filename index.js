require('dotenv').config();
const { Telegraf } = require('telegraf');
const cron = require('node-cron');
const { connectDB, User } = require('./database');
const { fetchOlxAds } = require('./parser'); 

const bot = new Telegraf(process.env.BOT_TOKEN);

// 🔒 WHITELIST: Масив дозволених ID
const ALLOWED_USERS = [
    983117009, // Твій ID
    394277140  // ID тата
];

// Middleware для перевірки доступу
bot.use((ctx, next) => {
    const userId = ctx.from?.id;
    
    // Якщо ID користувача є в нашому масиві - пропускаємо далі
    if (ALLOWED_USERS.includes(userId)) {
        return next();
    }
    
    // Якщо немає - відхиляємо і пишемо в консоль
    console.log(`❌ Спроба несанкціонованого доступу! ID: ${userId}, Username: @${ctx.from?.username}`);
    return;
});

// Команда /start, реєстрація в базі
bot.start(async (ctx) => {
    const chatId = ctx.chat.id;
    try {
        let user = await User.findOne({ chatId });
        
        if (!user) {
            user = new User({ 
                chatId, 
                keywords: [], 
                seenAds: [] 
            });
            await user.save();
            ctx.reply('Підключився до бази. За замовчуванням список ключових слів тепер порожній. Команда /add [ключове слово] дає змогу додати одне ключове слово за раз.');
        } else {
            ctx.reply('З поверненням. Парсер працює у фоні.');
        }
    } catch (err) {
        console.error(err);
        ctx.reply('Сталася помилка при підключенні до бази.');
    }
});

// Команда /help - довідка по всім можливостям бота
bot.command('help', (ctx) => {
    const helpText = `
🤖 <b>Довідка по командам OLX Радара:</b>

🟢 <b>Керування ботом:</b>
/start — Увімкнути бота та отримувати сповіщення
/stop — Зупинити бота (видалить дані та зупинить розсилку)
/help — Показати це повідомлення з підказками

🔍 <b>Що шукаємо:</b>
/add [слово] — Додати нове слово для пошуку (напр. <i>/add інвертор</i>)
/remove [слово] — Видалити слово з пошуку (напр. <i>/remove інвертор</i>)

🚫 <b>Що ігноруємо (анти-спам):</b>
/exclude [слово] — Додати мінус-слово. Оголошення з ним будуть ігноруватися (напр. <i>/exclude ремонт</i>)
/unexclude [слово] — Прибрати мінус-слово зі списку винятків (напр. <i>/unexclude ремонт</i>)

📋 <b>Перевірка:</b>
/list — Показати всі поточні ключові та мінус-слова
    `;
    
    // Відправляємо з параметром HTML, щоб працювали жирний шрифт та курсив
    ctx.reply(helpText, { parse_mode: 'HTML' });
});

// Команда /stop
bot.command('stop', async (ctx) => {
    try {
        await User.findOneAndDelete({ chatId: ctx.chat.id });
        ctx.reply('🛑 Бот зупинено. Дані видалено, розсилку вимкнено. Щоб увімкнути знову, напишіть /start.');
    } catch (error) {
        ctx.reply('Помилка при видаленні з бази.');
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

// Команда /exclude 
bot.command('exclude', async (ctx) => {
    const word = ctx.message.text.split(' ').slice(1).join(' ').trim().toLowerCase();
    if (!word) return ctx.reply('Вкажи слово-виняток. Приклад: /exclude ремонт');

    try {
        await User.findOneAndUpdate(
            { chatId: ctx.chat.id },
            { $addToSet: { stopWords: word } }
        );
        ctx.reply(`🚫 Мінус-слово "${word}" додано. Оголошення з ним будуть ігноруватися.`);
    } catch (error) {
        ctx.reply('Помилка при додаванні мінус-слова.');
    }
});

// Команда /unexclude
bot.command('unexclude', async (ctx) => {
    const word = ctx.message.text.split(' ').slice(1).join(' ').trim().toLowerCase();
    if (!word) return ctx.reply('Вкажи слово. Приклад: /unexclude ремонт');

    try {
        await User.findOneAndUpdate(
            { chatId: ctx.chat.id },
            { $pull: { stopWords: word } }
        );
        ctx.reply(`✅ Мінус-слово "${word}" видалено зі списку винятків.`);
    } catch (error) {
        ctx.reply('Помилка при видаленні мінус-слова.');
    }
});

// ОНОВЛЕНА команда /list
bot.command('list', async (ctx) => {
    try {
        const user = await User.findOne({ chatId: ctx.chat.id });
        if (!user) return ctx.reply('Список порожній.');

        let replyText = '<b>Твої налаштування пошуку:</b>\n\n';
        
        replyText += `✅ <b>Шукаємо:</b>\n`;
        replyText += user.keywords.length > 0 ? `- ${user.keywords.join('\n- ')}\n\n` : `Порожньо\n\n`;

        replyText += `🚫 <b>Ігноруємо (мінус-слова):</b>\n`;
        replyText += (user.stopWords && user.stopWords.length > 0) ? `- ${user.stopWords.join('\n- ')}` : `Порожньо`;

        ctx.reply(replyText, { parse_mode: 'HTML' });
    } catch (error) {
        ctx.reply('Не вдалося отримати список.');
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

// Запуск і підключення до БД
connectDB().then(() => {
    bot.launch();
    console.log('🤖 Телеграм-бот запущений');

    // Крон працює кожні 10 хвилин
    cron.schedule('*/10 * * * *', async () => {
        console.log('⏳ Запуск перевірки OLX...');
        
        try {
            const users = await User.find();

            for (const user of users) {

                if (user.keywords.length === 0) continue;

                for (const keyword of user.keywords) {
                    console.log(`Шукаємо: ${keyword} для чату ${user.chatId}`);
                    
                    const newAds = await fetchOlxAds(keyword);

                    // Перевіряємо, чи це найперший запуск
                    const isFirstRun = user.seenAds.length === 0;

                    for (const ad of newAds) {
                        if (!user.seenAds.includes(ad.id)) {
                            user.seenAds.push(ad.id);
                            // Перевіряємо, чи є в заголовку хоч одне мінус-слово
                            let hasStopWord = false;
                            if (user.stopWords && user.stopWords.length > 0) {
                                const titleLower = ad.title.toLowerCase();
                                hasStopWord = user.stopWords.some(stopWord => titleLower.includes(stopWord));
                            }
                            if (!isFirstRun && !ad.isOld && !hasStopWord) {
                                const message = `🚨 <b>Нове оголошення!</b>\n\n🔍 Запит: <i>${keyword}</i>\n📦 <b>${ad.title}</b>\n💰 Ціна: ${ad.price}\n\n🔗 <a href="${ad.link}">Перейти на OLX</a>`;
                                
                                await bot.telegram.sendMessage(user.chatId, message, { parse_mode: 'HTML' });
                            }
                        }
                    }
                }
                
                if (user.seenAds.length > 200) {
                    user.seenAds = user.seenAds.slice(-200);
                }
                
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
