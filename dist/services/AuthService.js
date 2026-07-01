"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const DatabaseService_1 = __importDefault(require("./DatabaseService"));
const VpnConfigService_1 = __importDefault(require("./VpnConfigService"));
const JWT_SECRET = process.env.JWT_SECRET || 'selfvpn_secret_key_change_in_production';
const JWT_EXPIRES_IN = '30d';
class AuthService {
    async register(email, password) {
        const existing = await DatabaseService_1.default.findUserByEmail(email);
        if (existing) {
            throw new Error('Пользователь с таким email уже существует');
        }
        const passwordHash = await bcryptjs_1.default.hash(password, 12);
        const user = await DatabaseService_1.default.createUser(email, passwordHash);
        const token = this.generateToken(user);
        return { token, user: this.sanitizeUser(user) };
    }
    async login(email, password) {
        const user = await DatabaseService_1.default.findUserByEmail(email);
        if (!user)
            throw new Error('Неверный email или пароль');
        const isValid = await bcryptjs_1.default.compare(password, user.passwordHash);
        if (!isValid)
            throw new Error('Неверный email или пароль');
        const token = this.generateToken(user);
        return { token, user: this.sanitizeUser(user) };
    }
    async deleteAccount(userId) {
        VpnConfigService_1.default.removePeer(userId);
        DatabaseService_1.default.deleteUser(userId);
    }
    verifyToken(token) {
        return jsonwebtoken_1.default.verify(token, JWT_SECRET);
    }
    generateToken(user) {
        const payload = {
            userId: user.id,
            email: user.email,
            plan: user.plan,
        };
        return jsonwebtoken_1.default.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    }
    sanitizeUser(user) {
        const { passwordHash, ...sanitized } = user;
        return sanitized;
    }
}
exports.default = new AuthService();
