"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const DatabaseService_1 = __importDefault(require("../services/DatabaseService"));
const VpnConfigService_1 = __importDefault(require("../services/VpnConfigService"));
const router = (0, express_1.Router)();
// Получить список серверов
router.get('/', auth_1.authMiddleware, async (req, res) => {
    try {
        const plan = req.user.plan;
        const servers = await DatabaseService_1.default.getServers(plan);
        res.json(servers);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Получить конфиг для сервера
router.get('/:id/config', auth_1.authMiddleware, async (req, res) => {
    try {
        const serverId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const server = await DatabaseService_1.default.getServerById(serverId);
        if (!server) {
            res.status(404).json({ error: 'Сервер не найден' });
            return;
        }
        // Проверяем доступ
        if (server.isPremium && req.user.plan === 'free') {
            res.status(403).json({ error: 'Этот сервер доступен только для Premium' });
            return;
        }
        const config = VpnConfigService_1.default.generateConfig(server, req.user.userId);
        res.json({ config });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
