'use client';

import { useState, useEffect, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Users, Send, Heart, MessageCircle, Trash2 } from 'lucide-react';
import { doc, getDoc, collection, addDoc, serverTimestamp, deleteDoc, setDoc, query, where, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth'; // Import auth listener
import { db, auth } from '@/lib/firebase';
import { useLocation } from '@/hooks/useLocation';
import { usePosts } from '@/hooks/usePosts';
import UserProfileModal from '@/components/UserProfileModal';
import PostItem from '@/components/PostItem';
import PeopleListModal from '@/components/PeopleListModal';

export default function ChatPage({ params }) {
    const { id: chatId } = use(params);
    const { location } = useLocation();
    const { posts, loading: postsLoading } = usePosts(chatId);
    const router = useRouter();

    const [chatInfo, setChatInfo] = useState(null);
    const [msgText, setMsgText] = useState('');
    const [sending, setSending] = useState(false);
    const [user, setUser] = useState(null); // Initialize null
    const [isPeopleOpen, setIsPeopleOpen] = useState(false);
    const [hasUnread, setHasUnread] = useState(false);

    // Auth Listener to ensure user is loaded on refresh
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (u) => {
            if (u) setUser(u);
            else router.push('/'); // Redirect if not authed (or handle anon)
        });
        return () => unsub();
    }, [router]);

    // Notification Listener
    useEffect(() => {
        if (!user) return;

        const q = query(
            collection(db, "conversations"),
            where("participants", "array-contains", user.uid)
        );

        const unsub = onSnapshot(q, (snap) => {
            let unread = false;
            snap.docs.forEach(doc => {
                const data = doc.data();

                // Only count as unread if:
                // 1. I am NOT the last sender
                // 2. The message exists (lastMessageTimestamp)
                // 3. I haven't seen it (lastViewed < lastMessageTimestamp)
                if (data.lastSenderId && data.lastSenderId !== user.uid) {
                    const lastMsgParams = data.lastMessageTimestamp;
                    const myViewParams = data.lastViewed?.[user.uid];

                    // Convert to millis for comparison
                    const lastMsgTime = lastMsgParams?.toMillis?.() || 0;
                    const myViewTime = myViewParams?.toMillis?.() || 0;

                    if (lastMsgTime > myViewTime) {
                        unread = true;
                    }
                }
            });
            setHasUnread(unread);
        });
        return () => unsub();
    }, [user]);

    // Presence Logic
    useEffect(() => {
        if (!user || !chatId) return;

        const presenceRef = doc(db, "chats", chatId, "presence", user.uid);

        // Write immediately
        const updatePresence = async () => {
            await setDoc(presenceRef, {
                uid: user.uid,
                displayName: user.displayName || 'Anonymous',
                photoURL: user.photoURL,
                lastSeen: serverTimestamp()
            });
        };
        updatePresence();

        // Heartbeat every 2 minutes
        const interval = setInterval(updatePresence, 120000);

        return () => clearInterval(interval);
    }, [user, chatId]);

    // Load chat info (Real-time)
    useEffect(() => {
        if (!chatId) return;

        const chatRef = doc(db, "chats", chatId);
        const unsub = onSnapshot(chatRef, (docSnap) => {
            if (docSnap.exists()) {
                setChatInfo({ id: docSnap.id, ...docSnap.data() });
            } else {
                console.error("Chat not found");
                alert("Chat no longer exists."); // Only alert if we confirmed it's gone
                router.push('/');
            }
        }, (error) => {
            console.error("Error loading chat:", error);
            if (error.code === 'permission-denied') {
                alert("Access Denied: You may need to refresh to get the latest permissions.");
                router.push('/');
            }
        });

        return () => unsub();
    }, [chatId, router]);

    // Strict Geofence Check interval
    useEffect(() => {
        if (!location || !chatInfo) return;
        const dist = getDistanceFromLatLonInM(location.lat, location.lng, chatInfo.lat, chatInfo.lng);
        if (dist > chatInfo.radius + 20) { // Buffer of 20m
            alert("You left the chat zone.");
            router.push('/');
        }
    }, [location, chatInfo, router]);

    const handlePost = async () => {
        if (!msgText.trim() || !user) return;

        try {
            setSending(true);
            await addDoc(collection(db, "chats", chatId, "posts"), {
                text: msgText,
                creatorId: user.uid,
                creatorName: user.displayName || 'Anonymous',
                creatorPhoto: user.photoURL,
                createdAt: serverTimestamp(),
                likes: []
            });
            setMsgText('');
        } catch (e) {
            console.error("Post failed", e);
        } finally {
            setSending(false);
        }
    };

    const handleDelete = async (postId) => {
        if (!confirm("Delete this post?")) return;
        try {
            await deleteDoc(doc(db, "chats", chatId, "posts", postId));
        } catch (e) {
            console.error(e);
        }
    };

    // Helper
    function getDistanceFromLatLonInM(lat1, lon1, lat2, lon2) {
        var R = 6371;
        var dLat = (lat2 - lat1) * (Math.PI / 180);
        var dLon = (lon2 - lon1) * (Math.PI / 180);
        var a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c * 1000;
    }

    if (!chatInfo) return (
        <div className="h-screen w-screen bg-black flex flex-col items-center justify-center space-y-4">
            <div className="text-purple-500 animate-pulse text-xl font-bold">Loading Chat...</div>
            <div className="text-gray-500 text-sm max-w-xs text-center">If this takes too long, try refreshing.</div>
        </div>
    );

    return (
        <main className="w-screen h-screen flex flex-col bg-black text-white">
            {/* Header */}
            <div className="glass-panel p-4 flex items-center justify-between sticky top-0 z-10 mx-2 mt-2">
                <button onClick={() => router.push('/')} className="p-2 hover:bg-white/10 rounded-full">
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <div className="flex-1 text-center flex flex-col items-center justify-center">
                    <h1 className="font-bold text-lg leading-tight">{chatInfo.name}</h1>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setIsPeopleOpen(true)}
                        className="p-2 hover:bg-white/10 rounded-full relative"
                    >
                        <Users className={`w-6 h-6 ${hasUnread ? 'text-purple-400 animate-pulse drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]' : 'text-purple-400'}`} />
                        {hasUnread && <span className="absolute top-0 right-0 w-3 h-3 bg-pink-500 rounded-full animate-ping" />}
                    </button>
                </div>
            </div>

            {/* Debugging Ownership */}
            {console.log("DEBUG ChatPage:", {
                userUid: user?.uid,
                creatorId: chatInfo?.creatorId,
                match: chatInfo?.creatorId === user?.uid
            })}

            <PeopleListModal
                isOpen={isPeopleOpen}
                onClose={() => setIsPeopleOpen(false)}
                chatId={chatId}
                currentUserId={user?.uid}
                isCreator={chatInfo.creatorId === user?.uid}
                creatorId={chatInfo.creatorId}
                onDeleteChat={async () => {
                    if (confirm("Delete this ENTIRE chat? This cannot be undone.")) {
                        await deleteDoc(doc(db, "chats", chatId));
                        router.push('/');
                    }
                }}
            />

            {/* Feed */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {posts.map(post => (
                    <PostItem
                        key={post.id}
                        post={post}
                        chatId={chatId}
                        currentUserId={user?.uid}
                        isOwner={chatInfo.creatorId === user?.uid}
                    />
                ))}

                {posts.length === 0 && (
                    <div className="text-center text-gray-600 mt-10">Be the first to post!</div>
                )}

                {/* Spacer for bottom input */}
                <div className="h-20" />
            </div>

            {/* Input Area */}
            <div className="absolute bottom-0 left-0 w-full bg-black/80 backdrop-blur-md p-4 border-t border-white/10 safe-pb z-20">
                <div className="flex items-center gap-2 bg-white/5 rounded-2xl p-2 border border-white/10">
                    <input
                        type="text"
                        value={msgText}
                        onChange={e => setMsgText(e.target.value)}
                        placeholder="Drop a message..."
                        className="flex-1 bg-transparent border-none focus:outline-none px-2 text-white placeholder-gray-500"
                        onKeyDown={e => e.key === 'Enter' && handlePost()}
                    />
                    <button
                        onClick={handlePost}
                        disabled={!msgText.trim() || sending}
                        className="p-2 bg-gradient-to-br from-purple-600 to-pink-600 rounded-xl text-white disabled:opacity-50"
                    >
                        <Send className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </main>
    );
}
