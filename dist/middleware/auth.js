"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = void 0;
const AuthService_1 = __importDefault(require("../services/AuthService"));
const authMiddleware = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Токен не предоставлен' });
            return;
        }
        const token = authHeader.substring(7);
        const payload = AuthService_1.default.verifyToken(token);
        req.user = payload;
        next();
    }
    catch (error) {
        res.status(401).json({ error: 'Недействительный токен' });
    }
};
exports.authMiddleware = authMiddleware;
