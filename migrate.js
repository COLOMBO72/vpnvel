const Database = require('better-sqlite3');
const { Client } = require('pg');

const sqlite = new Database('/opt/selfvpn/data/selfvpn.db');
const pg = new Client({
  connectionString: 'postgresql://velium_user:nigger66@localhost:5432/velium'
});

async function migrate() {
  await pg.connect();
  console.log('✅ Подключились к PostgreSQL');

  // Мигрируем пользователей
  const users = sqlite.prepare('SELECT * FROM users').all();
  console.log(`👥 Мигрируем ${users.length} пользователей...`);

  for (const user of users) {
    try {
      await pg.query(`
        INSERT INTO users (id, email, username, "passwordHash", plan, "generationsToday", "lastResetAt", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, 0, NOW(), $6, NOW())
        ON CONFLICT (email) DO NOTHING
      `, [
        user.id,
        user.email,
        user.email.split('@')[0],
        user.passwordHash,
        user.plan === 'premium' ? 'PREMIUM' : 'FREE',
        new Date(user.createdAt)
      ]);
      console.log(`✅ ${user.email}`);
    } catch(e) {
      console.log(`⚠️ Пропускаем ${user.email}:`, e.message);
    }
  }

  // Мигрируем серверы
  const servers = sqlite.prepare('SELECT * FROM servers').all();
  console.log(`🖥️ Мигрируем ${servers.length} серверов...`);

  for (const server of servers) {
    try {
      await pg.query(`
        INSERT INTO vpn_servers (id, name, country, flag, endpoint, "publicKey", "isPremium", "isActive", "comingSoon")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO NOTHING
      `, [
        server.id, server.name, server.country, server.flag,
        server.endpoint, server.publicKey,
        server.isPremium === 1, server.isActive === 1, server.comingSoon === 1
      ]);
      console.log(`✅ ${server.name}`);
    } catch(e) {
      console.log(`⚠️ Пропускаем сервер ${server.id}:`, e.message);
    }
  }

  // Мигрируем ключи
  const keys = sqlite.prepare('SELECT * FROM user_keys').all();
  console.log(`🔑 Мигрируем ${keys.length} ключей...`);

  for (const key of keys) {
    try {
      await pg.query(`
        INSERT INTO vpn_user_keys ("userId", "privateKey", "publicKey")
        VALUES ($1, $2, $3)
        ON CONFLICT ("userId") DO NOTHING
      `, [key.userId, key.privateKey, key.publicKey]);
      console.log(`✅ Ключи для ${key.userId}`);
    } catch(e) {
      console.log(`⚠️ Пропускаем ключ ${key.userId}:`, e.message);
    }
  }

  console.log('🎉 Миграция завершена!');
  await pg.end();
  sqlite.close();
}

migrate().catch(console.error);
