import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { headers } from 'next/headers';
import { adminDb } from '@/lib/firebase-admin';

export async function POST(req) {
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
        console.error(`Webhook verification failed:`, err.message);
        return NextResponse.json({ error: err.message }, { status: 400 });
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const userId = session.metadata?.userId || session.client_reference_id;

        if (userId) {
            console.log(`Granting premium to user: ${userId}`);
            try {
                // Update user doc with admin privileges
                await adminDb.collection('users').doc(userId).set({
                    subscriptionStatus: 'premium',
                    subscriptionId: session.subscription,
                    lastUpdated: new Date().toISOString()
                }, { merge: true });
            } catch (e) {
                console.error("Firestore Admin Update Failed:", e);
                return NextResponse.json({ error: "DB Update Failed" }, { status: 500 });
            }
        }
    }

    return NextResponse.json({ received: true });
}
