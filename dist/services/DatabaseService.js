"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const crypto_1 = __importDefault(require("crypto"));
const path_1 = __importDefault(require("path"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const pg_1 = require("pg");
console.log('DATABASE_URL:', process.env.DATABASE_URL);
const DB_PATH = path_1.default.join(__dirname, '../../data/selfvpn.db');
const pgClient = new pg_1.Client({
    connectionString: process.env.DATABASE_URL,
});
pgClient
    .connect()
    .then(() => console.log('✅ PostgreSQL синхронизация подключена'))
    .catch((e) => console.error('⚠️ PostgreSQL недоступен:', e.message));
// Утилита — fire and forget
function syncToPg(fn) {
    fn().catch((e) => console.error('⚠️ PG sync error:', e.message));
}
// Создаём папку data если нет
const fs_1 = __importDefault(require("fs"));
const dataDir = path_1.default.join(__dirname, '../../data');
if (!fs_1.default.existsSync(dataDir)) {
    fs_1.default.mkdirSync(dataDir, { recursive: true });
}
const db = new better_sqlite3_1.default(DB_PATH);
// Инициализация таблиц
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    passwordHash TEXT NOT NULL,
    plan TEXT DEFAULT 'free',
    isAdmin INTEGER DEFAULT 0,
    subscriptionExpiresAt TEXT,
    createdAt TEXT NOT NULL
  );


  CREATE TABLE IF NOT EXISTS user_keys (
  userId TEXT PRIMARY KEY,
  privateKey TEXT NOT NULL,
  publicKey TEXT NOT NULL
);

  CREATE TABLE IF NOT EXISTS servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    country TEXT NOT NULL,
    flag TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    publicKey TEXT NOT NULL,
    isPremium INTEGER DEFAULT 0,
    isActive INTEGER DEFAULT 1,
    comingSoon INTEGER DEFAULT 0
  );
`);
// Заполняем серверы если таблица пустая
const serverCount = db.prepare('SELECT COUNT(*) as count FROM servers').get();
if (serverCount.count === 0) {
    const insertServer = db.prepare(`
    INSERT INTO servers (id, name, country, flag, endpoint, publicKey, isPremium, isActive, comingSoon)
    VALUES (@id, @name, @country, @flag, @endpoint, @publicKey, @isPremium, @isActive, @comingSoon)
  `);
    const servers = [
        {
            id: '1',
            name: 'Нидерланды',
            country: 'NL',
            flag: '🇳🇱',
            endpoint: '94.241.174.77:51820',
            publicKey: 'KVHm5pqahUTpu1ZUUN99G0V3QId1ECA9fDLiOKjeGgE=',
            isPremium: 0,
            isActive: 1,
            comingSoon: 0,
        },
        {
            id: '2',
            name: 'Германия',
            country: 'DE',
            flag: '🇩🇪',
            endpoint: 'de.selfvpn.com:51820',
            publicKey: 'PLACEHOLDER',
            isPremium: 0,
            isActive: 0,
            comingSoon: 1,
        },
        {
            id: '3',
            name: 'Финляндия',
            country: 'FI',
            flag: '🇫🇮',
            endpoint: 'fi.selfvpn.com:51820',
            publicKey: 'PLACEHOLDER',
            isPremium: 0,
            isActive: 0,
            comingSoon: 1,
        },
        {
            id: '4',
            name: 'США — Нью-Йорк',
            country: 'US',
            flag: '🇺🇸',
            endpoint: 'us.selfvpn.com:51820',
            publicKey: 'PLACEHOLDER',
            isPremium: 1,
            isActive: 0,
            comingSoon: 1,
        },
        {
            id: '5',
            name: 'Япония — Токио',
            country: 'JP',
            flag: '🇯🇵',
            endpoint: 'jp.selfvpn.com:51820',
            publicKey: 'PLACEHOLDER',
            isPremium: 1,
            isActive: 0,
            comingSoon: 1,
        },
        {
            id: '6',
            name: 'Великобритания',
            country: 'GB',
            flag: '🇬🇧',
            endpoint: 'gb.selfvpn.com:51820',
            publicKey: 'PLACEHOLDER',
            isPremium: 1,
            isActive: 0,
            comingSoon: 1,
        },
    ];
    for (const server of servers) {
        insertServer.run(server);
    }
    console.log('✅ Серверы добавлены в БД');
}
const adminEmail = 'fizikaestw@gmail.com';
const existingAdmin = db.prepare('SELECT * FROM users WHERE email = ?').get(adminEmail);
if (!existingAdmin) {
    const adminPassword = bcryptjs_1.default.hashSync('admin_founder_729', 10);
    db.prepare(`
    INSERT INTO users (id, email, passwordHash, plan, isAdmin, createdAt)
    VALUES (@id, @email, @passwordHash, @plan, 1, @createdAt)
  `).run({
        id: crypto_1.default.randomUUID(),
        email: adminEmail,
        passwordHash: adminPassword,
        plan: 'premium',
        createdAt: new Date().toISOString(),
    });
    console.log('✅ Админский аккаунт создан');
}
class DatabaseService {
    getUserKeys(userId) {
        const row = db.prepare('SELECT * FROM user_keys WHERE userId = ?').get(userId);
        return row ? { privateKey: row.privateKey, publicKey: row.publicKey } : null;
    }
    deleteUserKeys(userId) {
        db.prepare('DELETE FROM user_keys WHERE userId = ?').run(userId);
    }
    saveUserKeys(userId, privateKey, publicKey) {
        db.prepare(`
    INSERT OR REPLACE INTO user_keys (userId, privateKey, publicKey)
    VALUES (?, ?, ?)
  `).run(userId, privateKey, publicKey);
        // Дублируем в PostgreSQL
        syncToPg(async () => {
            await pgClient.query(`
      INSERT INTO vpn_user_keys ("userId", "privateKey", "publicKey")
      VALUES ($1, $2, $3)
      ON CONFLICT ("userId") DO UPDATE SET "privateKey" = $2, "publicKey" = $3
    `, [userId, privateKey, publicKey]);
        });
    }
    // Пользователи
    findUserByEmail(email) {
        const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        return row ? this.rowToUser(row) : null;
    }
    findUserById(id) {
        const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        return row ? this.rowToUser(row) : null;
    }
    createUser(email, passwordHash) {
        const user = {
            id: crypto_1.default.randomUUID(),
            email,
            passwordHash,
            plan: 'free',
            createdAt: new Date(),
        };
        db.prepare(`
      INSERT INTO users (id, email, passwordHash, plan, isAdmin, createdAt)
      VALUES (@id, @email, @passwordHash, @plan, 0, @createdAt)
    `).run({
            ...user,
            createdAt: user.createdAt.toISOString(),
        });
        // Дублируем в PostgreSQL (fire and forget)
        syncToPg(async () => {
            await pgClient.query(`
      INSERT INTO users (id, email, username, "passwordHash", plan, "generationsToday", "lastResetAt", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, 'FREE', 0, NOW(), $5, NOW())
      ON CONFLICT (email) DO UPDATE SET "updatedAt" = NOW()
    `, [user.id, email, email.split('@')[0], passwordHash, user.createdAt.toISOString()]);
        });
        return user;
    }
    deleteUser(userId) {
        db.prepare('DELETE FROM user_keys WHERE userId = ?').run(userId);
        db.prepare('DELETE FROM users WHERE id = ?').run(userId);
        // Дублируем в PostgreSQL
        syncToPg(async () => {
            await pgClient.query('DELETE FROM vpn_user_keys WHERE "userId" = $1', [userId]);
            await pgClient.query('DELETE FROM users WHERE id = $1', [userId]);
        });
        console.log(`✅ Аккаунт удалён: ${userId}`);
    }
    updateUserPlan(userId, plan) {
        const expiresAt = plan === 'premium' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null;
        db.prepare(`
      UPDATE users SET plan = ?, subscriptionExpiresAt = ? WHERE id = ?
    `).run(plan, expiresAt, userId);
        // Дублируем в PostgreSQL
        syncToPg(async () => {
            const pgPlan = plan === 'premium' ? 'PREMIUM' : 'FREE';
            await pgClient.query(`
      UPDATE users SET plan = $1, "updatedAt" = NOW() WHERE id = $2
    `, [pgPlan, userId]);
            if (plan === 'premium' && expiresAt) {
                await pgClient.query(`
        INSERT INTO subscriptions (id, "userId", service, plan, status, "autoRenew", "expiresAt", "createdAt", "updatedAt")
        VALUES ($1, $2, 'VPN', 'PREMIUM', 'ACTIVE', true, $3, NOW(), NOW())
        ON CONFLICT ("userId") DO UPDATE SET status = 'ACTIVE', "expiresAt" = $3, "updatedAt" = NOW()
      `, [crypto_1.default.randomUUID(), userId, expiresAt]);
            }
        });
        return this.findUserById(userId);
    }
    activateSubscription(userId) {
        this.updateUserPlan(userId, 'premium');
        console.log(`✅ Premium активирован для ${userId}`);
    }
    // Серверы
    getServers(plan) {
        const rows = db.prepare('SELECT * FROM servers').all();
        return rows.map(this.rowToServer);
    }
    getServerById(id) {
        const row = db.prepare('SELECT * FROM servers WHERE id = ?').get(id);
        return row ? this.rowToServer(row) : null;
    }
    // Утилиты
    rowToUser(row) {
        return {
            id: row.id,
            email: row.email,
            passwordHash: row.passwordHash,
            plan: row.plan === 'premium' || row.plan === 'PREMIUM' ? 'premium' : 'free',
            isAdmin: row.isAdmin === 1,
            subscriptionExpiresAt: row.subscriptionExpiresAt
                ? new Date(row.subscriptionExpiresAt)
                : undefined,
            createdAt: new Date(row.createdAt),
        };
    }
    rowToServer(row) {
        return {
            id: row.id,
            name: row.name,
            country: row.country,
            flag: row.flag,
            endpoint: row.endpoint,
            publicKey: row.publicKey,
            isPremium: row.isPremium === 1,
            isActive: row.isActive === 1,
            comingSoon: row.comingSoon === 1,
        };
    }
}
exports.default = new DatabaseService();
