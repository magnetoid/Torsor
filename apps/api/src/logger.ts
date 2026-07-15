import dotenv from 'dotenv';
import { pino } from 'pino';

// Load .env before reading log config: this module is imported (transitively, via redis.ts
// and migrations) before index.ts runs dotenv.config(), and dotenv.config() is idempotent.
dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

// The single pino instance for apps/api. Exported so infra modules (redis, migrations)
// log structurally instead of via console.* — see ADR 0002.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
  transport: isProduction
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } },
});
