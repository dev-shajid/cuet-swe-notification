import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis({
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    maxRetriesPerRequest: null,
});

export const notificationQueue = new Queue('notification-queue', { connection });

export const QUEUE_EVENTS = {
    SEND_USER: 'send-user',
    SEND_USERS: 'send-users',
    SEND_COURSE: 'send-course',
    SEND_ROLE: 'send-role',
    SEND_BATCH: 'send-batch',
};
