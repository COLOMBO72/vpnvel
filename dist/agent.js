"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const pg_1 = require("pg");
require("dotenv/config");
const pgClient = new pg_1.Client({ connectionString: process.env.DATABASE_URL });
const SERVER_ID = process.env.SERVER_ID || 'nl-1';
async function reportStatus() {
    try {
        // Считаем онлайн пиров (handshake < 3 минут назад)
        const wgOutput = (0, child_process_1.execSync)('wg show wg0 dump').toString().trim();
        const peers = wgOutput.split('\n').slice(1);
        const onlinePeers = peers.filter(line => {
            const parts = line.split('\t');
            const lastHandshake = parseInt(parts[4] || '0');
            return lastHandshake > 0 && (Date.now() / 1000 - lastHandshake) < 180;
        }).length;
        // CPU нагрузка
        const cpuLoad = parseFloat((0, child_process_1.execSync)("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'").toString().trim()) || 0;
        // RAM нагрузка
        const memInfo = (0, child_process_1.execSync)('free -m').toString().split('\n')[1].split(/\s+/);
        const memPercent = Math.round(parseInt(memInfo[2]) / parseInt(memInfo[1]) * 100);
        await pgClient.query(`
      UPDATE vpn_servers 
      SET "isOnline" = true, "connectedUsers" = $1, "cpuLoad" = $2, 
          "memLoad" = $3, "lastSeen" = NOW()
      WHERE id = $4
    `, [onlinePeers, Math.round(cpuLoad), memPercent, SERVER_ID]);
        console.log(`✅ [${SERVER_ID}] онлайн: ${onlinePeers} пиров, CPU: ${cpuLoad}%, RAM: ${memPercent}%`);
    }
    catch (e) {
        console.error('Agent error:', e.message);
    }
}
async function main() {
    await pgClient.connect();
    console.log(`🚀 VPN Agent запущен для сервера ${SERVER_ID}`);
    await reportStatus();
    setInterval(reportStatus, 30000); // каждые 30 сек
}
main().catch(console.error);
