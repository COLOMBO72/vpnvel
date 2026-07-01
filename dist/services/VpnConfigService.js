"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const DatabaseService_1 = __importDefault(require("./DatabaseService"));
class VpnConfigService {
    generateConfig(server, userId) {
        const user = DatabaseService_1.default.findUserById(userId);
        const isPremium = user?.plan === 'premium';
        const clientIp = this.generateClientIp(userId, isPremium);
        let keys = DatabaseService_1.default.getUserKeys(userId);
        if (!keys) {
            keys = this.generateKeys();
            DatabaseService_1.default.saveUserKeys(userId, keys.privateKey, keys.publicKey);
            this.addPeerToServer(keys.publicKey, clientIp);
        }
        return `[Interface]
PrivateKey=${keys.privateKey}
Address=${clientIp}/32
DNS=8.8.8.8

[Peer]
PublicKey=KVHm5pqahUTpu1ZUUN99G0V3QId1ECA9fDLiOKjeGgE=
Endpoint=94.241.174.77:51820
AllowedIPs=0.0.0.0/0
PersistentKeepalive=25`;
    }
    generateKeys() {
        const privateKey = (0, child_process_1.execSync)('wg genkey').toString().trim();
        const publicKey = (0, child_process_1.execSync)(`echo "${privateKey}" | wg pubkey`).toString().trim();
        return { privateKey, publicKey };
    }
    addPeerToServer(publicKey, clientIp) {
        try {
            (0, child_process_1.execSync)(`wg set wg0 peer ${publicKey} allowed-ips ${clientIp}/32`);
            (0, child_process_1.execSync)('wg-quick save wg0');
            console.log(`✅ Peer добавлен: ${publicKey} → ${clientIp}`);
        }
        catch (error) {
            console.error('❌ Ошибка добавления peer:', error);
        }
    }
    removePeer(userId) {
        try {
            const keys = DatabaseService_1.default.getUserKeys(userId);
            if (!keys)
                return;
            (0, child_process_1.execSync)(`wg set wg0 peer ${keys.publicKey} remove`);
            (0, child_process_1.execSync)('wg-quick save wg0');
            console.log(`✅ Peer удалён для userId: ${userId}`);
        }
        catch (error) {
            console.error('❌ Ошибка удаления peer:', error);
        }
    }
    generateClientIp(userId, isPremium) {
        let hash = 0;
        for (let i = 0; i < userId.length; i++) {
            hash = (hash << 5) - hash + userId.charCodeAt(i);
            hash = hash & hash;
        }
        const num = Math.abs(hash) % 99;
        return isPremium
            ? `10.0.0.${128 + (num % 70)}`
            : `10.0.0.${2 + (num % 99)}`;
    }
}
exports.default = new VpnConfigService();
