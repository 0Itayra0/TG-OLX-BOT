const mongoose = require('mongoose');

// тестова схема
const userSchema = new mongoose.Schema({
    chatId: { type: Number, required: true, unique: true },
    keywords: [{ type: String }],
    seenAds: [{ type: String }] 
});

const User = mongoose.model('User', userSchema);

// Підключення до БД
async function connectDB() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('📦 База даних підключена успішно');
    } catch (error) {
        console.error('Помилка підключення до БД:', error);
    }
}

module.exports = { connectDB, User };