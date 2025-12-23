import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// In a real production app, we would use cert(serviceAccount)
// For "Lite" / Vercel deployment, we usually use environment variables 
// FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
// or rely on default credentials if on GCP.

let adminDb = null;

try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        const serviceAccount = JSON.parse(
            process.env.FIREBASE_SERVICE_ACCOUNT_KEY
        );

        if (!getApps().length) {
            initializeApp({
                credential: cert(serviceAccount),
            });
        }
        adminDb = getFirestore();
    } else {
        console.warn("FIREBASE_SERVICE_ACCOUNT_KEY is missing. Skipping Admin SDK initialization.");
        // Do not initialize, leave adminDb as null.
    }
} catch (e) {
    console.error("Firebase Admin Init Error:", e);
}

export { adminDb };
