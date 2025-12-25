import { db } from '../config/firebase';
import axios from 'axios';

const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';

// Interface for Push Message
interface PushMessage {
    to: string;
    sound: string;
    title: string;
    body: string;
    data?: any;
}

// Get push token for a user by email
export async function getUserPushToken(email: string): Promise<string | null> {
    try {
        const userDoc = await db.collection('users').doc(email).get();
        if (!userDoc.exists) return null;
        return userDoc.data()?.expoPushToken || null;
    } catch (error) {
        console.error('Error getting push token for', email, error);
        return null;
    }
}

// Send push notification to a single token using Axios
export async function sendPushNotification(
    expoPushToken: string,
    title: string,
    body: string,
    data?: any
) {
    const message: PushMessage = {
        to: expoPushToken,
        sound: 'default',
        title,
        body,
        data: data || {},
    };

    try {
        const response = await axios.post(EXPO_PUSH_API_URL, message, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip, deflate',
            },
        });

        const result = response.data;

        if (result.data?.status === 'error') {
            console.error('Push notification error:', result.data.message);
            return { success: false, error: result.data.message };
        }

        return { success: true, data: result };
    } catch (error: any) {
        console.error('Failed to send push notification:', error.response?.data || error.message);
        return { success: false, error: String(error) };
    }
}

// Send notification to a single user by email
export async function sendNotificationToUser(
    email: string,
    title: string,
    body: string,
    data?: any
) {
    const token = await getUserPushToken(email);

    if (!token) {
        console.warn('No push token for', email);
        return { success: false, error: 'no-token' };
    }

    return await sendPushNotification(token, title, body, data);
}

// Send notification to multiple users by email list
export async function sendNotificationToUsers(
    emailList: string[],
    title: string,
    body: string,
    data?: any
) {
    // In a real backend, we might want to use Expo's batch send API which accepts an array of messages
    // But to stick to the user's logic structure, we will iterate, or optimize slightly.
    // Optimally, we should group tokens and send in one batch to Expo if possible, 
    // but Expo API allows array of messages.

    // First, resolve all tokens
    const emailTokenMap = new Map<string, string>();

    // We can query multiple docs or just loop. For Firestore "IN" queries are limited to 10 or 30.
    // So looping might be simplest for now, or fetch all users?
    // Let's stick to the user's logic of processing them.

    const results = await Promise.all(
        emailList.map(async (email) => {
            try {
                // Determine if we should wait strictly like user code (setTimeout) or just parallelize?
                // Server side parallel is better. User code had wait to avoid rate limits?
                // Expo handles high concurrency well, but we can limit concurrency if needed.
                const result = await sendNotificationToUser(email, title, body, data);
                return { email, ...result };
            } catch (error) {
                console.error('Error sending to', email, error);
                return { email, success: false, error: String(error) };
            }
        })
    );

    const successful = results.filter(r => r.success).length;

    return {
        total: emailList.length,
        successful,
        failed: emailList.length - successful,
        results,
    };
}

// Send notification to all students in a course
export async function sendNotificationToCourseStudents(
    courseId: string,
    title: string,
    body: string,
    data?: any
) {
    try {
        // Get all students enrolled in the course - strictly following user's schema logic
        const enrollmentsSnapshot = await db.collection('enrollments')
            .where('courseId', '==', courseId)
            .get();

        const studentEmails = enrollmentsSnapshot.docs.map(doc => doc.data().studentEmail);

        if (studentEmails.length === 0) {
            return { total: 0, successful: 0, failed: 0, results: [] };
        }

        return await sendNotificationToUsers(studentEmails, title, body, data);
    } catch (error) {
        console.error('Error sending to course students:', error);
        return { total: 0, successful: 0, failed: 0, results: [], error: String(error) };
    }
}

// Send notification to all users with a specific role
export async function sendNotificationToUsersByRole(
    role: 'student' | 'teacher',
    title: string,
    body: string,
    data?: any
) {
    try {
        // Note: user code used `doc.id` as email for users collection.
        // `query(usersRef, where('role', '==', role))`
        const usersSnapshot = await db.collection('users')
            .where('role', '==', role)
            .get();

        const emails = usersSnapshot.docs.map(doc => doc.id);

        if (emails.length === 0) {
            return { total: 0, successful: 0, failed: 0, results: [] };
        }

        return await sendNotificationToUsers(emails, title, body, data);
    } catch (error) {
        console.error('Error sending to users by role:', error);
        return { total: 0, successful: 0, failed: 0, results: [], error: String(error) };
    }
}

// Send batch notifications
export async function sendBatchNotifications(
    notifications: Array<{
        email: string;
        title: string;
        body: string;
        data?: any;
    }>,
    chunkSize: number = 100
) {
    const chunks = [];
    for (let i = 0; i < notifications.length; i += chunkSize) {
        chunks.push(notifications.slice(i, i + chunkSize));
    }

    const allResults = [];

    for (const chunk of chunks) {
        const results = await Promise.all(
            chunk.map(async (notif) => {
                const result = await sendNotificationToUser(
                    notif.email,
                    notif.title,
                    notif.body,
                    notif.data
                );
                return { email: notif.email, ...result };
            })
        );
        allResults.push(...results);

        // Chunk delay
        if (chunks.length > 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    const successful = allResults.filter(r => r.success).length;

    return {
        total: notifications.length,
        successful,
        failed: notifications.length - successful,
        results: allResults,
    };
}
