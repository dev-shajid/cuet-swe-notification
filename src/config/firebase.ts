import admin from 'firebase-admin';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

// Attempt to initialize Firebase Admin
// Note: You need to generate a Service Account Key from Firebase Console -> Project Settings -> Service Accounts
// and save it as 'serviceAccountKey.json' in the root or provide the path in .env

try {
    const serviceAccountPath = process.env.SERVICE_ACCOUNT_KEY_PATH || path.resolve(process.cwd(), 'serviceAccountKey.json');
    console.log(`[Firebase] Attempting to load service account from: ${serviceAccountPath}`);

    if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('[Firebase] Initialized with Service Account');
    } else {
        console.warn(`[Firebase] Service account file not found at ${serviceAccountPath}. Using default credentials (GOOGLE_APPLICATION_CREDENTIALS).`);
        admin.initializeApp();
    }
} catch (error) {
    console.error("[Firebase] Initialization Error:", error);
}

export const db = admin.firestore();
export default admin;
