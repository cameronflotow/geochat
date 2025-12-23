import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { headers } from 'next/headers';
import { doc, updateDoc, getFirestore } from 'firebase/firestore';
// WARNING: transforming standard firebase client SDK to run in Node environment for API routes 
// requires 'firebase/firestore' to be polymorphic (it is).
// BUT Authentication is the issue. API routes are server-side.
// The Client SDK ('firebase/firestore') requires a signed-in user or open rules.
// For a Webhook (server-to-server), we are NOT signed in as a user.
// We need 'firebase-admin' to write to Firestore with admin privileges.
// I cannot use 'firebase/firestore' (Client SDK) here effectively unless rules are open or I emulate a user.
// 
// CORRECTION: Standard architecture requires 'firebase-admin' for API routes.
// "Lite" mode: I'll try to use 'firebase-admin' if available, or I must ask user to install it.
// Checking package.json... I haven't installed 'firebase-admin'.
// 
// I will install 'firebase-admin' now.
// For now, I will write the code assuming 'firebase-admin' is present or we use the REST API?
// No, 'firebase-admin' is the right way.
// 
// If I use Client SDK, I can't write to protected collections from a server environment without auth.
// Alternatively, I could use a simpler approach: Client-side success page triggers the update?
// Insecure. Users can fake it.
// 
// Use 'firebase-admin'. I'll add the task to install it.

// Placeholder Code with firebase-admin logic:
// import { adminDb } from '@/lib/firebase-admin'; 

// Wait, I haven't acted on 'firebase-admin'.
// Let's check if I can use the existing `db` (Client SDK from `@/lib/firebase`).
// It is initialized with `getFirestore(app)`.
// In a Node environment (API Route), `getFirestore` returns a client instance.
// But who is authenticated? No one. `auth.currentUser` is null.
// If security rules allow "if request.auth == null" (Public), it works.
// But user docs are private.
// 
// DECISION: I MUST use firebase-admin for the webhook.
// I will create `lib/firebase-admin.js` and install `firebase-admin`.

// Writing the file assuming `lib/firebase-admin` exists.

import { adminDb } from '@/lib/firebase-admin';

export async function POST(req) {
    if (!adminDb) {
        console.error("Firebase Admin not initialized. Cannot process webhook.");
        return NextResponse.json({ error: "Server Configuration Error" }, { status: 500 });
    }

    const body = await req.text();
    const signature = (await headers()).get('stripe-signature');

    let event;

    try {
        event = stripe.webhooks.constructEvent(
            body,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error(`Webhook signature verification failed.`, err.message);
        return NextResponse.json({ error: err.message }, { status: 400 });
    }

    // Handle the event
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const userId = session.metadata?.userId || session.client_reference_id;

        if (userId) {
            console.log(`Granting premium to ${userId}`);

            // Update Firestore using Admin SDK
            try {
                // adminDb is admin.firestore()
                await adminDb.collection('users').doc(userId).update({
                    subscriptionStatus: 'premium',
                    subscriptionId: session.subscription,
                    updatedAt: new Date().toISOString() // or admin.firestore.FieldValue.serverTimestamp()
                });
            } catch (e) {
                console.error("Firestore update failed:", e);
                // If doc doesn't exist, maybe set() instead?
                await adminDb.collection('users').doc(userId).set({
                    subscriptionStatus: 'premium',
                    subscriptionId: session.subscription,
                    updatedAt: new Date().toISOString()
                }, { merge: true });
            }
        }
    }

    return NextResponse.json({ received: true });
}
