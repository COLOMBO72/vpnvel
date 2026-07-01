import pkg from 'pg';
const { Client } = pkg;
import { execSync } from 'child_process';
import dotenv from 'dotenv';
dotenv.config({ path: '/opt/selfvpn/.env' });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function cleanupExpired() {
  await client.connect();
  console.log(`🔍 Проверка истёкших подписок: ${new Date().toISOString()}`);

  // Находим устройства с истёкшим trial и подпиской
  const result = await client.query(`
    SELECT id, "publicKey", name, "userId"
    FROM vpn_devices
    WHERE 
      "isActive" = true AND
      (
        ("subscriptionEndsAt" IS NULL AND "trialEndsAt" < NOW())
        OR
        ("subscriptionEndsAt" IS NOT NULL AND "subscriptionEndsAt" < NOW())
      )
  `);

  console.log(`📋 Найдено истёкших устройств: ${result.rows.length}`);

  for (const device of result.rows) {
    try {
      // Удаляем peer из WireGuard
      execSync(`wg set wg0 peer ${device.publicKey} remove`);
      console.log(`✅ Peer удалён: ${device.name} (${device.id})`);
    } catch (e) {
      console.log(`⚠️ Peer уже удалён или не найден: ${device.name}`);
    }

    // Помечаем устройство как неактивное
    await client.query(
      'UPDATE vpn_devices SET "isActive" = false WHERE id = $1',
      [device.id]
    );
  }

  // Сохраняем WireGuard конфиг
  if (result.rows.length > 0) {
    execSync('wg-quick save wg0');
    console.log('💾 WireGuard конфиг сохранён');
  }

  await client.end();
  console.log('✅ Очистка завершена');
}

cleanupExpired().catch(console.error);