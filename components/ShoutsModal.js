'use client';

import { useState } from 'react';
import { X, Send, MapPin, Users } from 'lucide-react';
import { collection, addDoc, serverTimestamp, doc, getDoc, setDoc } from 'firebase/firestore';
import { geohashForLocation } from 'geofire-common';
import { db, auth } from '@/lib/firebase';
import { useShouts } from '@/hooks/useShouts';
import ConversationsModal from './ConversationsModal';

export default function ShoutsModal({ isOpen, onClose, userLocation, user }) {
    const { shouts, loading } = useShouts(userLocation);
    const [text, setText] = useState('');
    const [sending, setSending] = useState(false);
    const [isConversationsOpen, setIsConversationsOpen] = useState(false);

    if (!isOpen) return null;

    const handlePostCapped = async (text) => {
        // Enforce Limits
        // 1 free shout per month, or Unlimited if Premium.
        // We'll trust the user doc "shoutsCount" and "subscriptionStatus"
        // But we need to Read it first.

        if (!user) {
            alert("Sign in to shout!");
            return;
        }

        setSending(true);
        try {
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);
            const userData = userSnap.data() || {};

            const isPremium = userData.subscriptionStatus === 'premium';
            const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
            const lastShoutMonth = userData.lastShoutMonth;
            let count = (lastShoutMonth === currentMonth) ? (userData.shoutsCount || 0) : 0;

            if (!isPremium && count >= 1) {
                alert("You've used your 1 free shout this month! Upgrade to Premium for $4/mo.");
                setSending(false);
                return;
            }

            // Post
            const hash = geohashForLocation([userLocation.lat, userLocation.lng]);
            await addDoc(collection(db, "shouts"), {
                text: text,
                lat: userLocation.lat,
                lng: userLocation.lng,
                geohash: hash,
                userId: user.uid,
                userName: user.displayName || 'Anonymous',
                userPhoto: user.photoURL,
                createdAt: serverTimestamp()
            });

            // Update usage logic
            // Use setDoc with merge to ensure doc exists and updates safety
            await setDoc(userRef, {
                shoutsCount: (count || 0) + 1,
                lastShoutMonth: currentMonth
            }, { merge: true });

        } catch (e) {
            console.error(e);
            alert("Failed to shout. " + e.message);
        } finally {
            setSending(false);
            setText('');
        }
    };

    return (
        <div className="fixed inset-0 z-[1500] flex items-end sm:items-center justify-center pointer-events-none">
            <div className="pointer-events-auto bg-[#1a1a1a] w-full sm:max-w-md h-[80vh] sm:h-[600px] sm:rounded-2xl border-t sm:border border-white/10 flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300">

                {/* Header */}
                <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setIsConversationsOpen(true)}
                            className="p-2 hover:bg-white/10 rounded-full transition-colors"
                        >
                            <MessageCircle className="w-5 h-5 text-white" />
                        </button>
                        <h2 className="font-bold text-white text-lg">Local Shouts (4mi)</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Feed */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {loading ? (
                        <div className="text-center text-gray-500 py-10">Listening for shouts...</div>
                    ) : shouts.length === 0 ? (
                        <div className="text-center text-gray-500 py-10">
                            <div className="text-3xl mb-2">📣</div>
                            No shouts nearby. Be the first!
                        </div>
                    ) : (
                        shouts.map(shout => (
                            <div key={shout.id} className="bg-black/40 p-4 rounded-xl border border-white/5">
                                <div className="flex items-start gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold shrink-0">
                                        {shout.userName?.[0]?.toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start">
                                            <span className="font-bold text-white text-sm">{shout.userName}</span>
                                            <span className="text-[10px] text-gray-500">
                                                {shout.createdAt?.toMillis ? new Date(shout.createdAt.toMillis()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                                            </span>
                                        </div>
                                        <p className="text-gray-200 text-sm mt-1 break-words">{shout.text}</p>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Input Area */}
                <div className="p-4 border-t border-white/10 bg-white/5">
                    <div className="flex gap-2">
                        <input
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder="Shout to everyone nearby..."
                            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
                            onKeyDown={(e) => e.key === 'Enter' && handlePostCapped(text)}
                        />
                        <button
                            onClick={() => handlePostCapped(text)}
                            disabled={!text.trim() || sending}
                            className="p-3 bg-purple-600 rounded-xl text-white disabled:opacity-50 hover:bg-purple-500 transition-colors"
                        >
                            <Send className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Conversations Modal (Inbox) */}
                <ConversationsModal
                    isOpen={isConversationsOpen}
                    onClose={() => setIsConversationsOpen(false)}
                    user={user}
                />
            </div>
        </div>
    );
}
