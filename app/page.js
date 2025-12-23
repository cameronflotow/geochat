'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useMemo } from 'react';
import { User, Plus, Share2, Users } from 'lucide-react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import UserProfileModal from '@/components/UserProfileModal';
import CreateChatModal from '@/components/CreateChatModal';
import WelcomeModal from '@/components/WelcomeModal';
import ShareModal from '@/components/ShareModal';
import ShoutsModal from '@/components/ShoutsModal';
import { useLocation } from '@/hooks/useLocation';
import { useChats } from '@/hooks/useChats';
import { deleteChatFully } from '@/lib/db-cleanup';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

export default function Home() {
    const [user, setUser] = useState(null);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [isCreateChatOpen, setIsCreateChatOpen] = useState(false);
    const [isShareOpen, setIsShareOpen] = useState(false);
    const [isShoutsOpen, setIsShoutsOpen] = useState(false);
    const { location, error: locationError } = useLocation();
    const { chats, loading: chatsLoading } = useChats(location);
    const router = useRouter();

    const [highlightedChats, setHighlightedChats] = useState([]);
    const [showWelcome, setShowWelcome] = useState(false);

    useEffect(() => {
        const agreed = localStorage.getItem('geochat_terms_accepted');
        if (!agreed) {
            setShowWelcome(true);
        }
    }, []);

    // Authentication
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
            } else {
                signInAnonymously(auth).catch(console.error);
            }
        });
        return () => unsubscribe();
    }, []);

    // Notification Listener for Map Highlights (Likes/Comments)
    useEffect(() => {
        if (!user) return;

        // Listen to my notifications
        const q = query(
            collection(db, "users", user.uid, "notifications"),
            where("read", "==", false)
        );

        const unsub = onSnapshot(q, (snap) => {
            const chatIds = new Set();
            snap.docs.forEach(doc => {
                const data = doc.data();
                if (data.chatId) chatIds.add(data.chatId);
            });
            setHighlightedChats(Array.from(chatIds));
        });
        return () => unsub();
    }, [user]);

    // Auto-Cleanup Expired Chats (8 Hours) - Note: kept as legacy safety net
    useEffect(() => {
        if (!chats.length) return;

        const cleanupExpiredChats = async () => {
            const now = Date.now();
            const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

            for (const chat of chats) {
                if (chat.createdAt?.toMillis) {
                    const elapsed = now - chat.createdAt.toMillis();
                    if (elapsed > TWENTY_FOUR_HOURS) {
                        console.log(`Chat ${chat.id} expired (${Math.round(elapsed / 1000 / 60)} mins old). Cleaning up...`);
                        await deleteChatFully(chat.id);
                    }
                }
            }
        };

        // Run cleanup on load (and when chats update)
        cleanupExpiredChats();
    }, [chats]);

    const Map = useMemo(() => dynamic(
        () => import('@/components/Map/Map'),
        {
            loading: () => <div className="w-full h-full flex items-center justify-center text-primary bg-black">Loading Geochat...</div>,
            ssr: false
        }
    ), []);

    const handleChatClick = (chat, isActive) => {
        if (isActive) {
            router.push(`/chat/${chat.id}`);
        } else {
            // Verify distance nicely? Or just tell them to get closer.
            // Map component already calculated it, 'isActive' is true if inside.
            // 2025: Relaxed slightly or maybe they drifted.
            alert(`You are too far from "${chat.name}" to enter! Get closer.`);
        }
    };

    return (
        <main className="w-screen h-[100dvh] relative overflow-hidden bg-black">
            <Map
                userLocation={location}
                chats={chats}
                onChatClick={handleChatClick}
                highlightedChatIds={highlightedChats}
            />

            {/* Top Bar */}
            <div className="absolute top-4 left-4 right-4 z-[1000] flex justify-between items-start pointer-events-none gap-2">

                {/* Left: Logo */}
                <div
                    onClick={() => window.location.reload()}
                    className="glass-panel p-3 px-6 pointer-events-auto cursor-pointer hover:scale-105 active:scale-95 transition-transform select-none"
                >
                    <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600 drop-shadow-sm">
                        Geochat
                    </h1>
                    {locationError && <div className="text-xs text-red-400">Locating failed</div>}
                </div>

                {/* Center: Share Button */}
                <div className="absolute left-1/2 -translate-x-1/2 pointer-events-auto">
                    <button
                        onClick={() => setIsShareOpen(true)}
                        className="glass-panel p-3 hover:bg-white/10 transition-all active:scale-95 group relative overflow-hidden"
                        title="Share"
                    >
                        <Share2 className="w-6 h-6 text-white group-hover:text-pink-400 transition-colors" />
                    </button>
                </div>

                {/* Right: Profile Button */}
                <button
                    onClick={() => setIsProfileOpen(true)}
                    className="glass-panel p-3 hover:bg-white/10 transition-all active:scale-95 pointer-events-auto group relative overflow-hidden"
                    title="User Profile"
                >
                    {user?.photoURL ? (
                        <img src={user.photoURL} alt="Profile" className="w-6 h-6 rounded-full object-cover border border-purple-500/50" />
                    ) : (
                        <div className="w-6 h-6 rounded-full border border-purple-500/50 flex items-center justify-center bg-gray-700 text-white text-xs font-bold">
                            {user?.displayName?.[0]?.toUpperCase() || <User className="w-4 h-4 text-white group-hover:text-purple-300 transition-colors" />}
                        </div>
                    )}
                </button>
            </div>

            {/* Bottom Controls - Fixed to Viewport */}

            {/* Bottom Left: Shouts Button */}
            <div className="fixed bottom-8 left-4 z-[1000] pointer-events-auto pb-safe">
                <button
                    onClick={() => setIsShoutsOpen(true)}
                    className="glass-panel px-4 py-3 flex items-center gap-2 hover:bg-white/10 transition-all active:scale-95 group"
                >
                    <div className="relative">
                        <Users className="w-6 h-6 text-white group-hover:text-yellow-400 transition-colors" />
                    </div>
                    <span className="font-bold text-white text-sm">Shouts</span>
                </button>
            </div>

            {/* Center: Create Chat FAB */}
            <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[1000] pointer-events-auto">
                <button
                    onClick={() => setIsCreateChatOpen(true)}
                    className="btn-primary w-16 h-16 flex items-center justify-center rounded-full shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 hover:scale-105 transition-all text-white"
                >
                    <Plus className="w-8 h-8" strokeWidth={3} />
                </button>
            </div>

            {/* Modals */}
            <ShoutsModal
                isOpen={isShoutsOpen}
                onClose={() => setIsShoutsOpen(false)}
                userLocation={location}
                user={user}
            />

            <ShareModal
                isOpen={isShareOpen}
                onClose={() => setIsShareOpen(false)}
            />

            <UserProfileModal
                isOpen={isProfileOpen}
                onClose={() => setIsProfileOpen(false)}
                user={user}
            />

            <CreateChatModal
                isOpen={isCreateChatOpen}
                onClose={() => setIsCreateChatOpen(false)}
                userLocation={location}
                existingChats={chats}
                user={user}
            />

            <WelcomeModal
                isOpen={showWelcome}
                onAgree={async () => {
                    localStorage.setItem('geochat_terms_accepted', 'true');
                    setShowWelcome(false);

                    if (user) {
                        try {
                            await updateDoc(doc(db, "users", user.uid), {
                                termsAccepted: true,
                                termsAcceptedAt: serverTimestamp()
                            });
                        } catch (e) {
                            console.error("Error saving terms acceptance", e);
                        }
                    }
                }}
            />
        </main>
    );
}
