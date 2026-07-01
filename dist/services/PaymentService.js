"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentService = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const YOOKASSA_API = 'https://api.yookassa.ru/v3';
exports.PaymentService = {
    async createPayment(userId, plan) {
        const amount = plan === 'monthly' ? '299.00' : '1990.00';
        const description = plan === 'monthly' ? 'Premium подписка на 1 месяц' : 'Premium подписка на 1 год';
        const idempotenceKey = crypto_1.default.randomUUID();
        const response = await axios_1.default.post(`${YOOKASSA_API}/payments`, {
            amount: { value: amount, currency: 'RUB' },
            confirmation: {
                type: 'redirect',
                return_url: `${process.env.APP_URL}/api/payment/success`,
            },
            description,
            metadata: { userId, plan },
            capture: true,
        }, {
            auth: {
                username: process.env.YOOKASSA_SHOP_ID,
                password: process.env.YOOKASSA_SECRET_KEY,
            },
            headers: {
                'Idempotence-Key': idempotenceKey,
                'Content-Type': 'application/json',
            },
        });
        return {
            paymentUrl: response.data.confirmation.confirmation_url,
            paymentId: response.data.id,
        };
    },
    async checkPayment(paymentId) {
        const response = await axios_1.default.get(`${YOOKASSA_API}/payments/${paymentId}`, {
            auth: {
                username: process.env.YOOKASSA_SHOP_ID,
                password: process.env.YOOKASSA_SECRET_KEY,
            },
        });
        return response.data.status === 'succeeded';
    },
};
