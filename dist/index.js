"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const auth_1 = __importDefault(require("./routes/auth"));
const servers_1 = __importDefault(require("./routes/servers"));
const subscription_1 = __importDefault(require("./routes/subscription"));
const payment_1 = __importDefault(require("./routes/payment"));
const vpn_1 = __importDefault(require("./routes/vpn"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use('/public', express_1.default.static(path_1.default.join(__dirname, '../public')));
app.use('/api/vpn', vpn_1.default);
// Роуты
app.use('/api/auth', auth_1.default);
app.use('/api/servers', servers_1.default);
app.use('/api/subscription', subscription_1.default);
app.use('/api/payment', payment_1.default);
// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Запуск сервера
app.listen(PORT, () => {
    console.log(`🚀 SELFVPN Server запущен на порту ${PORT}`);
});
exports.default = app;
