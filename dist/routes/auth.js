"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const AuthService_1 = __importDefault(require("../services/AuthService"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Регистрация
router.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400).json({ error: 'Email и пароль обязательны' });
            return;
        }
        if (password.length < 6) {
            res.status(400).json({ error: 'Пароль должен быть минимум 6 символов' });
            return;
        }
        const result = await AuthService_1.default.register(email, password);
        res.status(201).json(result);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// Вход
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400).json({ error: 'Email и пароль обязательны' });
            return;
        }
        const result = await AuthService_1.default.login(email, password);
        res.json(result);
    }
    catch (error) {
        res.status(401).json({ error: error.message });
    }
});
// Удаление аккаунта
// Удаление аккаунта
router.delete('/delete-account', auth_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ error: 'Пользователь не найден' });
            return;
        }
        await AuthService_1.default.deleteAccount(userId);
        res.json({ message: 'Аккаунт успешно удалён' });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
