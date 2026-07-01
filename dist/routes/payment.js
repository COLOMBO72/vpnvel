"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const PaymentService_1 = require("../services/PaymentService");
const auth_1 = require("../middleware/auth");
const DatabaseService_1 = __importDefault(require("../services/DatabaseService"));
const router = (0, express_1.Router)();
// Создать платёж
router.post('/create', auth_1.authMiddleware, async (req, res) => {
    try {
        const { plan } = req.body;
        const userId = req.userId;
        if (!plan || !['monthly', 'yearly'].includes(plan)) {
            return res.status(400).json({ error: 'Неверный план' });
        }
        const { paymentUrl, paymentId } = await PaymentService_1.PaymentService.createPayment(userId, plan);
        res.json({ paymentUrl, paymentId });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Проверить статус платежа
router.get('/status/:paymentId', auth_1.authMiddleware, async (req, res) => {
    try {
        const paymentId = Array.isArray(req.params.paymentId)
            ? req.params.paymentId[0]
            : req.params.paymentId;
        const userId = req.userId;
        const isPaid = await PaymentService_1.PaymentService.checkPayment(paymentId);
        if (isPaid) {
            // Активируем Premium
            DatabaseService_1.default.activateSubscription(userId);
            res.json({ status: 'succeeded', plan: 'premium' });
        }
        else {
            res.json({ status: 'pending' });
        }
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Webhook от ЮКассы
router.post('/webhook', async (req, res) => {
    try {
        const { event, object } = req.body;
        if (event === 'payment.succeeded') {
            const userId = object.metadata?.userId;
            if (userId) {
                DatabaseService_1.default.activateSubscription(userId);
                console.log(`✅ Premium активирован для пользователя ${userId}`);
            }
        }
        res.json({ ok: true });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
