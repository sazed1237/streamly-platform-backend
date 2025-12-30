import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const shouldSkipRedis =
    process.env.OPENAPI_GENERATION === '1' ||
    process.env.SKIP_REDIS === '1' ||
    (process.env.SKIP_REDIS || '').toLowerCase() === 'true';

export const connection = shouldSkipRedis
    ? null
    : new IORedis(process.env.REDIS_HOST, {
            port: process.env.REDIS_PORT,
            password: process.env.REDIS_PASSWORD,
            maxRetriesPerRequest: null,
            sentinelMaxConnections: 10,
            connectTimeout: 10000,
            retryStrategy: (times) => Math.min(times * 500, 5000),
            enableReadyCheck: true,
            tls: (process.env.REDIS_HOST || '').startsWith('rediss://') ? {} : undefined,
        });

if (!shouldSkipRedis) {
    connection.on('connect', () => console.log('[Redis] connected'));
    connection.on('error', (e) => console.error('[Redis] error:', e?.message || e));
}

export const mediaQueue = shouldSkipRedis
    ? {
            add: async () => undefined,
        }
    : new Queue('media', { connection });
