'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useMemo } from 'react';
import { Plus, MapPin, User, Settings, Sparkles, Navigation, X, Megaphone, Grab, Share2, Smile } from 'lucide-react';


import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { distanceBetween } from 'geofire-common';
import UserProfileModal from '@/components/UserProfileModal';
import CreateChatModal from '@/components/CreateChatModal';
import WelcomeModal from '@/components/WelcomeModal';
import ShareModal from '@/components/ShareModal';
import ShoutsModal from '@/components/ShoutsModal';
import SignupPromptModal from '@/components/SignupPromptModal';
import { useLocation } from '@/hooks/useLocation';
import { useChats } from '@/hooks/useChats';
import { useShouts } from '@/hooks/useShouts';
import { deleteChatFully } from '@/lib/db-cleanup';
import { doc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useEmojiSystem } from '@/hooks/useEmojiSystem';

const Map = dynamic(() => import('@/components/Map/Map'), {
    loading: () => <div className="w-full h-full flex items-center justify-center text-primary bg-black">Loading Geochat...</div>,
    ssr: false
});

export default function Home() {
    const [user, setUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [isCreateChatOpen, setIsCreateChatOpen] = useState(false);
    const [isShareOpen, setIsShareOpen] = useState(false);
    const [isShoutsOpen, setIsShoutsOpen] = useState(false);

    // Prompt State
    const [isSignupPromptOpen, setIsSignupPromptOpen] = useState(false);
    const [profileAuthMode, setProfileAuthMode] = useState(false);

    // State must be declared BEFORE usage in hooks
    const [highlightedChats, setHighlightedChats] = useState([]);
    const [showWelcome, setShowWelcome] = useState(false);
    const [notification, setNotification] = useState(null);
    const [shoutRadius, setShoutRadius] = useState(10); // Default 10mi

    const { location, error: locationError } = useLocation();
    const router = useRouter();

    // Hooks dependent on state/location
    const { chats, loading: chatsLoading } = useChats(location);
    const { shouts } = useShouts(location, shoutRadius);
    const { nearbyItems, canCollectItem, collectItem } = useEmojiSystem(location, user);

    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => setNotification(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    // Persist Radius
    useEffect(() => {
        const saved = localStorage.getItem('geochat_radius');
        if (saved) {
            setShoutRadius(Number(saved));
        }
    }, []);

    useEffect(() => {
        localStorage.setItem('geochat_radius', shoutRadius);
    }, [shoutRadius]);

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

    // Listen to User Profile
    useEffect(() => {
        if (!user) return;
        const unsub = onSnapshot(doc(db, "users", user.uid), (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                setUserData(data);

                // SEED DEFAULTS: If missing 'Single' (marker for starter pack), add them.
                if (!data.inventory || !data.inventory['Single']) {
                    setDoc(doc(db, "users", user.uid), {
                        inventory: {
                            'Single': 1,
                            'Taken': 1,
                            'Complicated': 1,
                            'Adventurous': 1,
                            'Wants 🍺': 1,
                            'Wants 💬': 1
                        }
                    }, { merge: true }).catch(e => console.log("Seeding failed", e));
                }
            }
        });
        return () => unsub();
    }, [user]);

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

    // Map definition moved to top level
    const handleChatClick = (chat, isActive) => {
        if (isActive) {
            router.push(`/chat/${chat.id}`);
        } else {
            setNotification({
                type: 'error',
                message: `Too far from "${chat.name}"! Get closer to enter.`
            });
        }
    };

    const handleCatch = async () => {
        const success = await collectItem();
        if (success) {
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3');
            audio.volume = 0.5;
            audio.play().catch(e => console.log("Audio play failed", e));

            // Check for Anonymous First Collect
            if (user?.isAnonymous) {
                const hasSeenPrompt = localStorage.getItem('geochat_signup_prompt_shown');
                if (!hasSeenPrompt) {
                    setTimeout(() => setIsSignupPromptOpen(true), 1500); // Small delay for effect
                    localStorage.setItem('geochat_signup_prompt_shown', 'true');
                }
            }
        } else {
            setNotification({
                type: 'error',
                message: "Too slow! It got away."
            });
        }
    };

    const handleTooFar = () => {
        setNotification({
            type: 'error',
            message: "Not close enough! Move closer to catch."
        });
    };

    const filteredChats = useMemo(() => {
        if (!location || !chats) return [];
        const radiusKm = shoutRadius * 1.60934;
        return chats.filter(chat => {
            const distKm = distanceBetween([location.lat, location.lng], [chat.lat, chat.lng]);
            return distKm <= radiusKm;
        });
    }, [chats, location, shoutRadius]);

    return (
        <main className="w-screen h-[100dvh] relative overflow-hidden bg-black">
            <Map
                userLocation={location}
                chats={filteredChats}
                shouts={shouts}
                shoutRadius={shoutRadius}
                currentUser={user}
                onChatClick={handleChatClick}
                highlightedChatIds={highlightedChats}
                mapItems={nearbyItems}
                canCollectItem={canCollectItem}
                onCollectItem={handleCatch}
                onTooFarClick={handleTooFar}
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
                <div className="flex flex-col items-center pointer-events-auto">
                    <button
                        onClick={() => setIsProfileOpen(true)}
                        className="glass-panel p-3 hover:bg-white/10 transition-all active:scale-95 group relative overflow-hidden mb-1"
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
                    {!user?.isAnonymous && <span className="text-[9px] text-gray-400 font-medium">Update Profile</span>}
                </div>
            </div>

            {/* Bottom Controls - Fixed to Viewport */}

            {/* Bottom Left: Shouts Button */}
            <div className="fixed bottom-8 left-4 z-[1000] pointer-events-auto pb-safe">
                <button
                    onClick={() => setIsShoutsOpen(true)}
                    className="glass-panel p-4 flex items-center justify-center hover:bg-white/10 transition-all active:scale-95 group rounded-full"
                    title="Local Shouts"
                >
                    <Megaphone className="w-6 h-6 text-white group-hover:text-yellow-400 transition-colors" />
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
                shouts={shouts}
                radius={shoutRadius}
                setRadius={setShoutRadius}
            />

            <ShareModal
                isOpen={isShareOpen}
                onClose={() => setIsShareOpen(false)}
            />

            <UserProfileModal
                isOpen={isProfileOpen}
                onClose={() => { setIsProfileOpen(false); setProfileAuthMode(false); }}
                user={user}
                userData={userData}
                initialAuthMode={profileAuthMode}
            />

            <SignupPromptModal
                isOpen={isSignupPromptOpen}
                onClose={() => setIsSignupPromptOpen(false)}
                onCreateAccount={() => {
                    setIsSignupPromptOpen(false);
                    setProfileAuthMode(true);
                    setIsProfileOpen(true);
                }}
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

            {/* Notifications / Toasts */}
            {notification && (
                <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[2000] pointer-events-none animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="glass-panel px-6 py-3 rounded-2xl border border-white/10 shadow-2xl flex items-center gap-3 backdrop-blur-xl bg-black/60">
                        {notification.type === 'error' ? (
                            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        ) : (
                            <div className="w-2 h-2 rounded-full bg-blue-500" />
                        )}
                        <span className="text-white font-medium text-sm drop-shadow-md">{notification.message}</span>
                    </div>
                </div>
            )}
        </main>
    );
}
