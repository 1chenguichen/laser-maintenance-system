#!/usr/bin/env node
/**
 * 数据库种子数据脚本
 *
 *   npm run db:seed
 *
 * 行为：
 *   1. 读取 backend/.env 中的数据库连接配置（不存在则用默认值）
 *   2. 等待 PostgreSQL 就绪
 *   3. 清空业务表
 *   4. 导入 database/seed-data.sql 演示数据
 *
 * 注意：脚本会清空现有数据，仅用于本地开发/演示环境。
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- 环境变量
function loadEnv() {
  const envPath = join(__dirname, '..', '.env');
  if (!existsSync(envPath)) return;
  for (const raw of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnv();

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USERNAME || 'laser_user',
  password: process.env.DB_PASSWORD || 'laser_pass_2024',
  database: process.env.DB_DATABASE || 'laser_maintenance',
};

// 需要清空的业务表（外键自上而下无所谓，CASCADE 会处理）
const TABLES = [
  'notifications',
  'service_chats',
  'reviews',
  'complaints',
  'maintenance_records',
  'dispatch_records',
  'work_orders',
  'devices',
  'addresses',
  'engineer_monthly_stats',
  'engineers',
  'customers',
];

// ---------------------------------------------------------------- 工具函数
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect(retries = 30) {
  for (let i = 1; i <= retries; i++) {
    const client = new Client(config);
    try {
      await client.connect();
      return client;
    } catch (err) {
      await client.end().catch(() => {});
      if (i === retries) throw err;
      process.stdout.write(
        `   等待数据库就绪... (${i}/${retries}) ${err.message}\n`,
      );
      await sleep(1000);
    }
  }
}

/** 去掉 pg_dump 生成的 psql 专用元命令（\restrict / \unrestrict 等） */
function stripPsqlMeta(sql) {
  return sql
    .split(/\r?\n/)
    .filter((line) => !line.startsWith('\\'))
    .join('\n');
}

async function tableExists(client, name) {
  const { rows } = await client.query(
    `SELECT to_regclass('public.${name}') IS NOT NULL AS exists`,
  );
  return rows[0].exists;
}

// ---------------------------------------------------------------- 主流程
async function main() {
  console.log('=== 激光设备维保系统 - 数据库种子数据 ===\n');
  console.log(`目标数据库: ${config.user}@${config.host}:${config.port}/${config.database}\n`);

  const client = await connect();
  console.log('[1/4] 数据库连接成功');

  // 表不存在说明后端还没跑过，TypeORM 需要先 synchronize 建表
  const missing = [];
  for (const t of TABLES) {
    if (!(await tableExists(client, t))) missing.push(t);
  }
  if (missing.length) {
    console.error(
      `\n[错误] 以下表不存在: ${missing.join(', ')}\n` +
        `       请先启动一次后端 (npm run start:dev) 让 TypeORM 自动建表，再运行本脚本。\n`,
    );
    await client.end();
    process.exit(1);
  }
  console.log('[2/4] 业务表检查通过');

  await client.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
  console.log(`[3/4] 已清空 ${TABLES.length} 张业务表`);

  const seedPath = join(__dirname, 'seed-data.sql');
  if (!existsSync(seedPath)) {
    console.error(`\n[错误] 找不到种子文件: ${seedPath}\n`);
    await client.end();
    process.exit(1);
  }
  const sql = stripPsqlMeta(readFileSync(seedPath, 'utf8'));
  await client.query(sql);
  // 种子 SQL 把 search_path 清空了，恢复成 public 以便后续语句正常使用
  await client.query(`SELECT pg_catalog.set_config('search_path', 'public', false)`);
  console.log('[4/4] 种子数据导入完成\n');

  // 注意：种子 SQL 里有 set_config('search_path','')，会把会话的 search_path 清空，
  // 所以这里必须用 schema 限定名。
  const summary = await client.query(`
    SELECT '客户'        AS 类别, count(*) AS 数量 FROM public.customers
    UNION ALL SELECT '工程师',    count(*) FROM public.engineers
    UNION ALL SELECT '设备',      count(*) FROM public.devices
    UNION ALL SELECT '地址',      count(*) FROM public.addresses
    UNION ALL SELECT '工单',      count(*) FROM public.work_orders
    UNION ALL SELECT '派单记录',  count(*) FROM public.dispatch_records
    UNION ALL SELECT '评价',      count(*) FROM public.reviews
    UNION ALL SELECT '客服会话',  count(*) FROM public.service_chats
  `);

  console.log('导入数据统计:');
  for (const row of summary.rows) {
    console.log(`   ${row.类别.padEnd(6, '　')} ${row.数量}`);
  }
  console.log('\n提示: 测试登录验证码固定为 000000');
  console.log('      客户 13800138000 / 工程师 13900000002 / 客服 13800138000\n');

  await client.end();
}

main().catch((err) => {
  console.error('\n[失败]', err.message);
  process.exit(1);
});
