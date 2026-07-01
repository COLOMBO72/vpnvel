"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const DatabaseService_1 = __importDefault(require("../services/DatabaseService"));
const router = (0, express_1.Router)();
// Получить статус подписки
router.get('/status', auth_1.authMiddleware, async (req, res) => {
    try {
        const user = await DatabaseService_1.default.findUserById(req.user.userId);
        if (!user) {
            res.status(404).json({ error: 'Пользователь не найден' });
            return;
        }
        res.json({
            plan: user.plan,
            subscriptionExpiresAt: user.subscriptionExpiresAt,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Активировать Premium (позже здесь будет реальная проверка платежа)
router.post('/activate', auth_1.authMiddleware, async (req, res) => {
    try {
        const user = await DatabaseService_1.default.updateUserPlan(req.user.userId, 'premium');
        if (!user) {
            res.status(404).json({ error: 'Пользователь не найден' });
            return;
        }
        res.json({
            plan: user.plan,
            subscriptionExpiresAt: user.subscriptionExpiresAt,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
