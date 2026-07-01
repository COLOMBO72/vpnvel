"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const child_process_1 = require("child_process");
const pg_1 = require("pg");
const router = (0, express_1.Router)();
const pgClient = new pg_1.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 3000,
  idleTimeoutMillis: 10000,
});
// Получить все устройства пользователя
router.get("/devices", auth_1.authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await pgClient.query(
      'SELECT * FROM vpn_devices WHERE "userId" = $1 ORDER BY "createdAt" ASC',
      [userId],
    );
    res.json({ devices: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Добавить устройство
router.post("/devices", auth_1.authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name } = req.body;
    // Проверяем лимит устройств
    const count = await pgClient.query(
      'SELECT COUNT(*) FROM vpn_devices WHERE "userId" = $1',
      [userId],
    );
    if (parseInt(count.rows[0].count) >= 5) {
      res.status(400).json({ error: "Максимум 5 устройств на аккаунт" });
      return;
    }
    // Генерируем ключи
    const privateKey = (0, child_process_1.execSync)("wg genkey")
      .toString()
      .trim();
    const publicKey = (0, child_process_1.execSync)(
      `echo "${privateKey}" | wg pubkey`,
    )
      .toString()
      .trim();
    // Генерируем IP
    const ip = await generateUniqueIp(pgClient);
    // Trial на 3 дня
    const trialEndsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const deviceId = crypto.randomUUID();
    await pgClient.query(
      `
      INSERT INTO vpn_devices (id, "userId", name, plan, "privateKey", "publicKey", ip, "trialEndsAt", "createdAt")
      VALUES ($1, $2, $3, 'trial', $4, $5, $6, $7, NOW())
    `,
      [
        deviceId,
        userId,
        name || "Устройство",
        privateKey,
        publicKey,
        ip,
        trialEndsAt,
      ],
    );
    // Добавляем peer на WireGuard
    (0, child_process_1.execSync)(
      `wg set wg0 peer ${publicKey} allowed-ips ${ip}/32`,
    );
    (0, child_process_1.execSync)("wg-quick save wg0");
    // Ставим ограничение скорости 10 Mbps для trial
    console.log(`✅ Устройство добавлено: ${publicKey} → ${ip}`);
    res.json({ deviceId, message: "Устройство добавлено" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Получить QR код для устройства
router.get("/devices/:id/qr", auth_1.authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const deviceId = req.params.id;
    const result = await pgClient.query(
      'SELECT * FROM vpn_devices WHERE id = $1 AND "userId" = $2',
      [deviceId, userId],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "Устройство не найдено" });
      return;
    }
    const device = result.rows[0];
    // Проверяем что подписка активна
    const now = new Date();
    const isTrialActive =
      device.trialEndsAt && new Date(device.trialEndsAt) > now;
    const isSubActive =
      device.subscriptionEndsAt && new Date(device.subscriptionEndsAt) > now;
    if (!isTrialActive && !isSubActive) {
      res.status(403).json({ error: "Подписка истекла" });
      return;
    }
    const config = `[Interface]
PrivateKey = ${device.privateKey}
Address = ${device.ip}/32
DNS = 8.8.8.8

[Peer]
PublicKey = ${process.env.WG_PUBKEY}
Endpoint = ${process.env.WG_ENDPOINT}
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25`;
    res.json({ config, device });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Купить подписку для устройства
router.post(
  "/devices/:id/subscribe",
  auth_1.authMiddleware,
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const deviceId = req.params.id;
      // Получаем устройство
      const deviceRes = await pgClient.query(
        'SELECT * FROM vpn_devices WHERE id = $1 AND "userId" = $2',
        [deviceId, userId],
      );
      const device = deviceRes.rows[0];
      if (!device) {
        res.status(404).json({ error: "Устройство не найдено" });
        return;
      }
      let newIp = device.ip;
      const { plan, billingType } = req.body; // plan: basic/standard, billingType: monthly/yearly
      const planPrices = {
        basic: { monthly: 100, yearly: 960 },
        standard: { monthly: 180, yearly: 1728 },
      };
      const price = planPrices[plan]?.[billingType];
      if (!price) {
        res.status(400).json({ error: "Неверный план" });
        return;
      }
      // Проверяем баланс
      const balanceRes = await pgClient.query(
        'SELECT amount FROM balances WHERE "userId" = $1',
        [userId],
      );
      const balance = parseFloat(balanceRes.rows[0]?.amount || "0");
      if (balance < price) {
        res
          .status(400)
          .json({ error: `Недостаточно средств. Нужно ${price}₽` });
        return;
      }
      // Списываем баланс
      await pgClient.query(
        'UPDATE balances SET amount = amount - $1 WHERE "userId" = $2',
        [price, userId],
      );
      // Активируем подписку
      const months = billingType === "yearly" ? 12 : 1;
      const subscriptionEndsAt = new Date(
        Date.now() + months * 30 * 24 * 60 * 60 * 1000,
      );
      await pgClient.query(
        `
  UPDATE vpn_devices 
  SET plan = $1, "billingType" = $2, "subscriptionEndsAt" = $3, ip = $4, "isActive" = true
  WHERE id = $5 AND "userId" = $6
`,
        [plan, billingType, subscriptionEndsAt, newIp, deviceId, userId],
      );
      // Восстанавливаем peer в WireGuard если его нет
      try {
        const wgPeers = (0, child_process_1.execSync)(
          "wg show wg0 peers",
        ).toString();
        if (!wgPeers.includes(device.publicKey)) {
          (0, child_process_1.execSync)(
            `wg set wg0 peer ${device.publicKey} allowed-ips ${newIp}/32`,
          );
          (0, child_process_1.execSync)("wg-quick save wg0");
          console.log(`✅ Peer восстановлен: ${device.publicKey} → ${newIp}`);
        }
      } catch (e) {
        console.error("Ошибка восстановления peer:", e);
      }
      res.json({ message: "Подписка активирована", subscriptionEndsAt });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
);
// Активировать подписку (вызывается с бэкенда сайта)
router.post("/devices/:id/activate", async (req, res) => {
  try {
    const deviceId = req.params["id"];
    const body = req.body;
    const { plan, billingType, userId } = body;
    const months = billingType === "yearly" ? 12 : 1;
    const subscriptionEndsAt = new Date(
      Date.now() + months * 30 * 24 * 60 * 60 * 1000,
    );
    // Получаем устройство
    const deviceRes = await pgClient.query(
      'SELECT * FROM vpn_devices WHERE id = $1 AND "userId" = $2',
      [deviceId, userId],
    );
    const device = deviceRes.rows[0];
    if (!device) {
      res.status(404).json({ error: "Устройство не найдено" });
      return;
    }
    let newIp = device.ip;
    // Для basic и standard — переносим в Premium диапазон (10.0.0.128+)
    if (plan === "standard" || plan === "basic") {
      const usedIps = await pgClient.query("SELECT ip FROM vpn_devices");
      const used = usedIps.rows.map((r) => r.ip);
      const reserved = ["10.0.0.1", "10.0.0.101", "10.0.0.102"];
      // Если уже в Premium диапазоне — не меняем IP
      const currentIpNum = parseInt(device.ip.split(".")[3]);
      if (currentIpNum < 128) {
        for (let i = 128; i <= 200; i++) {
          const candidate = `10.0.0.${i}`;
          if (!reserved.includes(candidate) && !used.includes(candidate)) {
            newIp = candidate;
            break;
          }
        }
        try {
          (0, child_process_1.execSync)(
            `wg set wg0 peer ${device.publicKey} remove`,
          );
          (0, child_process_1.execSync)(
            `wg set wg0 peer ${device.publicKey} allowed-ips ${newIp}/32`,
          );
          (0, child_process_1.execSync)("wg-quick save wg0");
          console.log(`✅ IP изменён: ${device.ip} → ${newIp}`);
        } catch (e) {
          console.error("Ошибка обновления WireGuard:", e);
        }
      }
    }
    // Обновляем БД
    await pgClient.query(
      `
  UPDATE vpn_devices 
  SET plan = $1, "billingType" = $2, "subscriptionEndsAt" = $3, ip = $4, "isActive" = true
  WHERE id = $5 AND "userId" = $6
`,
      [plan, billingType, subscriptionEndsAt, newIp, deviceId, userId],
    );
    // Восстанавливаем peer в WireGuard если его нет
    try {
      const wgPeers = (0, child_process_1.execSync)(
        "wg show wg0 peers",
      ).toString();
      if (!wgPeers.includes(device.publicKey)) {
        (0, child_process_1.execSync)(
          `wg set wg0 peer ${device.publicKey} allowed-ips ${newIp}/32`,
        );
        (0, child_process_1.execSync)("wg-quick save wg0");
        console.log(`✅ Peer восстановлен: ${device.publicKey} → ${newIp}`);
      }
    } catch (e) {
      console.error("Ошибка восстановления peer:", e);
    }
    res.json({ message: "Подписка активирована", subscriptionEndsAt, newIp });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Удалить устройство
router.delete("/devices/:id", auth_1.authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const deviceId = req.params.id;
    const result = await pgClient.query(
      'SELECT * FROM vpn_devices WHERE id = $1 AND "userId" = $2',
      [deviceId, userId],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "Устройство не найдено" });
      return;
    }
    const device = result.rows[0];
    // Удаляем peer с WireGuard
    try {
      (0, child_process_1.execSync)(
        `wg set wg0 peer ${device.publicKey} remove`,
      );
      (0, child_process_1.execSync)("wg-quick save wg0");
    } catch (e) {
      console.error("Ошибка удаления peer:", e);
    }
    await pgClient.query("DELETE FROM vpn_devices WHERE id = $1", [deviceId]);
    res.json({ message: "Устройство удалено" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
async function generateUniqueIp(client) {
  const reserved = ["10.0.0.1", "10.0.0.101", "10.0.0.102"];
  const result = await client.query("SELECT ip FROM vpn_devices");
  const usedIps = result.rows.map((r) => r.ip);
  for (let i = 2; i <= 200; i++) {
    const ip = `10.0.0.${i}`;
    if (!reserved.includes(ip) && !usedIps.includes(ip)) {
      return ip;
    }
  }
  throw new Error("Нет свободных IP адресов");
}
// Админ статистика
router.get("/admin/stats", auth_1.authMiddleware, async (req, res) => {
  try {
    // Проверяем что это админ
    const userId = req.user.userId;
    // Проверяем по email вместо isAdmin
    const userRes = await pgClient.query("SELECT * FROM users WHERE id = $1", [
      userId,
    ]);
    const user = userRes.rows[0];
    const ADMIN_EMAILS = ["fizikaestw@gmail.com", "321@12.ru"];
    if (!ADMIN_EMAILS.includes(user?.email)) {
      res.status(403).json({ error: "Доступ запрещён" });
      return;
    }
    // WireGuard статистика
    const wgOutput = (0, child_process_1.execSync)("wg show wg0 dump")
      .toString()
      .trim();
    const peers = wgOutput
      .split("\n")
      .slice(1)
      .map((line) => {
        const parts = line.split("\t");
        return {
          publicKey: parts[0],
          endpoint: parts[2] || null,
          latestHandshake: parts[4]
            ? new Date(parseInt(parts[4]) * 1000)
            : null,
          rxBytes: parseInt(parts[5]) || 0,
          txBytes: parseInt(parts[6]) || 0,
          isOnline: parts[4] && Date.now() / 1000 - parseInt(parts[4]) < 180,
        };
      });
    const onlinePeers = peers.filter((p) => p.isOnline).length;
    const totalRx = peers.reduce((sum, p) => sum + p.rxBytes, 0);
    const totalTx = peers.reduce((sum, p) => sum + p.txBytes, 0);
    // БД статистика
    const dbStats = await pgClient.query(`
      SELECT
        COUNT(*) as total_devices,
        COUNT(CASE WHEN "subscriptionEndsAt" > NOW() THEN 1 END) as active_subscriptions,
        COUNT(CASE WHEN "trialEndsAt" > NOW() AND "subscriptionEndsAt" IS NULL THEN 1 END) as trial_devices,
        COUNT(CASE WHEN plan = 'standard' AND "subscriptionEndsAt" > NOW() THEN 1 END) as standard_devices,
        COUNT(CASE WHEN plan = 'basic' AND "subscriptionEndsAt" > NOW() THEN 1 END) as basic_devices
      FROM vpn_devices
    `);
    const usersStats = await pgClient.query(
      "SELECT COUNT(*) as total FROM users",
    );
    // CPU и RAM
    const cpuLoad = (0, child_process_1.execSync)(
      "top -bn1 | grep 'Cpu(s)' | awk '{print $2}'",
    )
      .toString()
      .trim();
    const memInfo = (0, child_process_1.execSync)("free -m").toString();
    const memLines = memInfo.split("\n")[1].split(/\s+/);
    const memTotal = parseInt(memLines[1]);
    const memUsed = parseInt(memLines[2]);
    res.json({
      wireguard: {
        onlinePeers,
        totalPeers: peers.length,
        totalRxGB: (totalRx / 1024 / 1024 / 1024).toFixed(2),
        totalTxGB: (totalTx / 1024 / 1024 / 1024).toFixed(2),
      },
      devices: {
        total: parseInt(dbStats.rows[0].total_devices),
        activeSubscriptions: parseInt(dbStats.rows[0].active_subscriptions),
        trial: parseInt(dbStats.rows[0].trial_devices),
        standard: parseInt(dbStats.rows[0].standard_devices),
        basic: parseInt(dbStats.rows[0].basic_devices),
      },
      users: {
        total: parseInt(usersStats.rows[0].total),
      },
      server: {
        cpuLoad: parseFloat(cpuLoad),
        memUsedMB: memUsed,
        memTotalMB: memTotal,
        memPercent: Math.round((memUsed / memTotal) * 100),
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
exports.default = router;
