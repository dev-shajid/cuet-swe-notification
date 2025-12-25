import { Request, Response } from 'express';
import { notificationQueue, QUEUE_EVENTS } from '../config/queue';

export const sendToUser = async (req: Request, res: Response) => {
    try {
        const { email, title, body, data } = req.body;
        if (!email || !title || !body) {
            return res.status(400).json({ error: 'Missing required fields: email, title, body' });
        }

        await notificationQueue.add(QUEUE_EVENTS.SEND_USER, { email, title, body, data });
        res.json({ success: true, message: 'Notification queued' });
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
};

export const sendToUsers = async (req: Request, res: Response) => {
    try {
        const { emails, title, body, data } = req.body;
        if (!emails || !Array.isArray(emails) || !title || !body) {
            return res.status(400).json({ error: 'Missing required fields: emails (array), title, body' });
        }

        await notificationQueue.add(QUEUE_EVENTS.SEND_USERS, { emails, title, body, data });
        res.json({ success: true, message: 'Batch notification queued' });
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
};

export const sendToCourse = async (req: Request, res: Response) => {
    try {
        const { courseId, title, body, data } = req.body;
        if (!courseId || !title || !body) {
            return res.status(400).json({ error: 'Missing required fields: courseId, title, body' });
        }

        await notificationQueue.add(QUEUE_EVENTS.SEND_COURSE, { courseId, title, body, data });
        res.json({ success: true, message: 'Course notification queued' });
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
};

export const sendToRole = async (req: Request, res: Response) => {
    try {
        const { role, title, body, data } = req.body;
        if (!role || !title || !body) {
            return res.status(400).json({ error: 'Missing required fields: role, title, body' });
        }
        if (role !== 'student' && role !== 'teacher') {
            return res.status(400).json({ error: 'Role must be either student or teacher' });
        }

        await notificationQueue.add(QUEUE_EVENTS.SEND_ROLE, { role, title, body, data });
        res.json({ success: true, message: 'Role notification queued' });
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
};

export const sendBatch = async (req: Request, res: Response) => {
    try {
        const { notifications } = req.body;
        if (!notifications || !Array.isArray(notifications)) {
            return res.status(400).json({ error: 'Missing required fields: notifications (array)' });
        }

        await notificationQueue.add(QUEUE_EVENTS.SEND_BATCH, { notifications });
        res.json({ success: true, message: 'Batch notification queued' });
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
};
