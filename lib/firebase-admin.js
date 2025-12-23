import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// In a real production app, we would use cert(serviceAccount)
// For "Lite" / Vercel deployment, we usually use environment variables 
// FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
// or rely on default credentials if on GCP.

// For now, I'll attempt basic initialization which might fail locally without CREDENTIALS.
// But this is "Setting up the foundation".

if (!getApps().length) {
    try {
        const serviceAccount = JSON.parse(
            process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}'
        );

        // If empty, try default init (works if GOOGLE_APPLICATION_CREDENTIALS set)
        if (Object.keys(serviceAccount).length > 0) {
            initializeApp({
                credential: cert(serviceAccount),
            });
        } else {
            initializeApp();
        }
    } catch (e) {
        console.error("Firebase Admin Init Error:", e);
        // Fallback or let it throw
        if (!getApps().length) initializeApp();
    }
}

export const adminDb = getFirestore();
