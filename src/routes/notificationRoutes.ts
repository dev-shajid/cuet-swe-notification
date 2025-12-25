import { Router } from 'express';
import * as notificationController from '../controllers/notificationController';

const router = Router();

// Send to single user
router.post('/user', notificationController.sendToUser);

// Send to multiple users
router.post('/users', notificationController.sendToUsers);

// Send to course students
router.post('/course', notificationController.sendToCourse);

// Send to user role
router.post('/role', notificationController.sendToRole);

// Send batch custom
router.post('/batch', notificationController.sendBatch);

export default router;
