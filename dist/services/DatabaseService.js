"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const crypto_1 = require("crypto");
const bcryptjs_1 = require("bcryptjs");
const pg_1 = require("pg");

const pool = new pg_1.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 3000,
  idleTimeoutMillis: 10000,
});

pool
  .connect()
  .then(() => console.log("✅ PostgreSQL подключён"))
  .catch((e) => console.error("⚠️ PostgreSQL недоступен:", e.message));

// Создаём таблицы
pool
  .query(
    `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    "passwordHash" TEXT NOT NULL,
    plan TEXT DEFAULT 'free',
    "isAdmin" INTEGER DEFAULT 0,
    "subscriptionExpiresAt" TEXT,
    "createdAt" TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_keys (
    "userId" TEXT PRIMARY KEY,
    "privateKey" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS vpn_devices (
    id TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    name TEXT NOT NULL,
    plan TEXT DEFAULT 'trial',
    "privateKey" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    ip TEXT NOT NULL,
    "trialEndsAt" TIMESTAMPTZ,
    "subscriptionEndsAt" TIMESTAMPTZ,
    "billingType" TEXT,
    "isActive" BOOLEAN DEFAULT true,
    "serverId" TEXT DEFAULT 'pl-1',
    "createdAt" TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS balances (
    id TEXT PRIMARY KEY,
    "userId" TEXT UNIQUE NOT NULL,
    amount FLOAT DEFAULT 0
  );
`,
  )
  .then(() => console.log("✅ Таблицы созданы"))
  .catch((e) => console.error("⚠️ Ошибка создания таблиц:", e.message));

// Создаём админа
async function createAdmin() {
  const adminEmail = "fizikaestw@gmail.com";
  const existing = await pool.query("SELECT id FROM users WHERE email = $1", [
    adminEmail,
  ]);
  if (existing.rows.length === 0) {
    const hash = await bcryptjs_1.hash("admin_founder_729", 10);
    await pool.query(
      'INSERT INTO users (id, email, "passwordHash", plan, "isAdmin", "createdAt") VALUES ($1, $2, $3, $4, 1, $5)',
      [
        crypto_1.randomUUID(),
        adminEmail,
        hash,
        "premium",
        new Date().toISOString(),
      ],
    );
    console.log("✅ Админ создан");
  }
}
createAdmin().catch((e) => console.error("Admin error:", e.message));

class DatabaseService {
  async getUserKeys(userId) {
    const r = await pool.query('SELECT * FROM user_keys WHERE "userId" = $1', [
      userId,
    ]);
    return r.rows[0]
      ? { privateKey: r.rows[0].privateKey, publicKey: r.rows[0].publicKey }
      : null;
  }

  async deleteUserKeys(userId) {
    await pool.query('DELETE FROM user_keys WHERE "userId" = $1', [userId]);
  }

  async saveUserKeys(userId, privateKey, publicKey) {
    await pool.query(
      'INSERT INTO user_keys ("userId", "privateKey", "publicKey") VALUES ($1, $2, $3) ON CONFLICT ("userId") DO UPDATE SET "privateKey" = $2, "publicKey" = $3',
      [userId, privateKey, publicKey],
    );
  }

  async findUserByEmail(email) {
    const r = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    return r.rows[0] ? this.rowToUser(r.rows[0]) : null;
  }

  async findUserById(id) {
    const r = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    return r.rows[0] ? this.rowToUser(r.rows[0]) : null;
  }

  async createUser(email, passwordHash) {
    const id = crypto_1.randomUUID();
    const createdAt = new Date().toISOString();
    await pool.query(
      'INSERT INTO users (id, email, "passwordHash", plan, "isAdmin", "createdAt") VALUES ($1, $2, $3, $4, 0, $5)',
      [id, email, passwordHash, "free", createdAt],
    );
    return {
      id,
      email,
      passwordHash,
      plan: "free",
      createdAt: new Date(createdAt),
    };
  }

  async deleteUser(userId) {
    await pool.query('DELETE FROM user_keys WHERE "userId" = $1', [userId]);
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    console.log(`✅ Аккаунт удалён: ${userId}`);
  }

  async updateUserPlan(userId, plan) {
    const expiresAt =
      plan === "premium"
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        : null;
    await pool.query(
      'UPDATE users SET plan = $1, "subscriptionExpiresAt" = $2 WHERE id = $3',
      [plan, expiresAt, userId],
    );
    return this.findUserById(userId);
  }

  async getServers() {
    return [
      {
        id: "pl-1",
        name: "Польша",
        country: "PL",
        flag: "🇵🇱",
        endpoint: "212.192.22.155:51820",
        publicKey: "ODSrLW9b5ztLBJXJtGe5BJ8aKARk8rmb5YbTUMM1oRc=",
        isPremium: false,
        isActive: true,
        comingSoon: false,
      },
    ];
  }

  async getServerById(id) {
    const servers = await this.getServers();
    return servers.find((s) => s.id === id) || null;
  }

  getPool() {
    return pool;
  }

  rowToUser(row) {
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      plan:
        row.plan === "premium" || row.plan === "PREMIUM" ? "premium" : "free",
      isAdmin: row.isAdmin === 1 || row.isAdmin === true,
      subscriptionExpiresAt: row.subscriptionExpiresAt
        ? new Date(row.subscriptionExpiresAt)
        : undefined,
      createdAt: new Date(row.createdAt),
    };
  }
}

exports.default = new DatabaseService();
