import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import * as notificationService from '../services/notificationService';
import { QUEUE_EVENTS } from '../config/queue';

const connection = new IORedis({
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    maxRetriesPerRequest: null,
});

const worker = new Worker('notification-queue', async (job) => {
    console.log(`[Worker] Processing job ${job.id} of type ${job.name}`);

    try {
        switch (job.name) {
            case QUEUE_EVENTS.SEND_USER:
                return await notificationService.sendNotificationToUser(
                    job.data.email,
                    job.data.title,
                    job.data.body,
                    job.data.data
                );
            case QUEUE_EVENTS.SEND_USERS:
                return await notificationService.sendNotificationToUsers(
                    job.data.emails,
                    job.data.title,
                    job.data.body,
                    job.data.data
                );
            case QUEUE_EVENTS.SEND_COURSE:
                return await notificationService.sendNotificationToCourseStudents(
                    job.data.courseId,
                    job.data.title,
                    job.data.body,
                    job.data.data
                );
            case QUEUE_EVENTS.SEND_ROLE:
                return await notificationService.sendNotificationToUsersByRole(
                    job.data.role,
                    job.data.title,
                    job.data.body,
                    job.data.data
                );
            case QUEUE_EVENTS.SEND_BATCH:
                return await notificationService.sendBatchNotifications(job.data.notifications);
            default:
                throw new Error(`Unknown job name: ${job.name}`);
        }
    } catch (error) {
        console.error(`[Worker] Job ${job.id} failed:`, error);
        throw error;
    }
}, { connection });

worker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} completed!`);
});

worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed with ${err.message}`);
});

export default worker;
