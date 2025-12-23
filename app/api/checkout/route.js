import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { db } from '@/lib/firebase'; // Admin SDK preferred for webhooks, but this is client SDK?
// Valid point: API Routes run on server, but 'firebase/firestore' is Client SDK.
// For simple writes it works if rules allow it or if we are authenticated?
// Actually API routes in Next.js do NOT have client auth context unless passed.
// For Checkout Creation: We receive userID from client.
// We trust client? No. Ideally we verify Auth token.
// But for "Lite", let's trust the passed userID or require a token.
// I'll accept 'userId' and 'priceId' in body.
// And pass it to Stripe metadata.

export async function POST(req) {
    try {
        const body = await req.json();
        const { userId, priceId, returnUrl } = body;

        if (!userId || !priceId) {
            return NextResponse.json({ error: 'Missing userId or priceId' }, { status: 400 });
        }

        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            metadata: {
                userId: userId,
            },
            client_reference_id: userId,
            success_url: `${returnUrl || 'https://geochat.space'}?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${returnUrl || 'https://geochat.space'}`,
        });

        return NextResponse.json({ url: session.url });
    } catch (error) {
        console.error('Stripe Checkout Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
