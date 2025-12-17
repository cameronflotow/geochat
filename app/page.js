'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useMemo } from 'react';
import { User, Plus } from 'lucide-react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import UserProfileModal from '@/components/UserProfileModal';
import CreateChatModal from '@/components/CreateChatModal';
import { useLocation } from '@/hooks/useLocation';
import { useChats } from '@/hooks/useChats';

export default function Home() {
    const [user, setUser] = useState(null);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [isCreateChatOpen, setIsCreateChatOpen] = useState(false);
    const { location, error: locationError } = useLocation();
    const { chats, loading: chatsLoading } = useChats();
    const router = useRouter();

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
    const [highlightedChats, setHighlightedChats] = useState([]);

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
        <main className="w-screen h-screen relative overflow-hidden bg-black">
            <Map
                userLocation={location}
                chats={chats}
                onChatClick={handleChatClick}
                highlightedChatIds={highlightedChats}
            />

            {/* Top Bar */}
            <div className="absolute top-4 left-4 right-4 z-[1000] flex justify-between items-start pointer-events-none">
                {/* Logo */}
                <div className="glass-panel p-3 px-6 pointer-events-auto">
                    <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600 drop-shadow-sm">
                        Geochat
                    </h1>
                    {locationError && <div className="text-xs text-red-400">Locating failed</div>}
                </div>

                {/* User Profile Button */}
                <button
                    onClick={() => setIsProfileOpen(true)}
                    className="glass-panel p-3 hover:bg-white/10 transition-all active:scale-95 pointer-events-auto group relative overflow-hidden"
                    title="User Profile"
                >
                    {user?.photoURL ? (
                        <img src={user.photoURL} alt="Profile" className="w-6 h-6 rounded-full object-cover border border-purple-500/50" />
                    ) : (
                        <User className="w-6 h-6 text-white group-hover:text-purple-300 transition-colors" />
                    )}
                </button>
            </div>

            {/* Floating Action Button (Create Chat) */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[1000] pointer-events-auto">
                <button
                    onClick={() => setIsCreateChatOpen(true)}
                    className="btn-primary w-16 h-16 flex items-center justify-center rounded-full shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 hover:scale-105 transition-all text-white"
                >
                    <Plus className="w-8 h-8" strokeWidth={3} />
                </button>
            </div>

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
        </main>
    );
}
