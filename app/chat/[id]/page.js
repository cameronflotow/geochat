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
import ConversationsModal from '@/components/ConversationsModal'; // Added missing import
import { deleteChatFully, deletePostFully } from '@/lib/db-cleanup';

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
    const [isConversationsOpen, setIsConversationsOpen] = useState(false); // Added missing state
    const [unreadUserIds, setUnreadUserIds] = useState(new Set());

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
            const newUnreadIds = new Set();
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
                        // Identify the OTHER user in this chat
                        const otherUserId = data.participants.find(p => p !== user.uid);
                        if (otherUserId) {
                            newUnreadIds.add(otherUserId);
                        }
                    }
                }
            });
            setUnreadUserIds(newUnreadIds);
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

        return () => {
            clearInterval(interval);
            deleteDoc(presenceRef).catch(e => console.error("Error clearing presence:", e));
        };
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

            // Rolling Window Logic: Limit to 300 posts
            const MAX_POSTS = 300;
            if (posts.length >= MAX_POSTS) {
                // posts are ordered DESC (Newest First). So the last item is the Oldest.
                // We keep (MAX_POSTS - 1) items, so we have room for the new one.
                // If we are already at or above limit, we delete the overflow.

                // Identify the oldest post(s) to remove
                const oldestPost = posts[posts.length - 1]; // Simply pick the tail
                if (oldestPost) {
                    console.log(`Rolling Window: deleting oldest post ${oldestPost.id}`);
                    // Fire and forget deletion to not block the new post
                    deletePostFully(chatId, oldestPost.id).catch(err => console.error("Error cycling post:", err));
                }
            }

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
        <main className="w-screen h-[100dvh] flex flex-col bg-black text-white overflow-hidden">
            {/* Header - Flex Item, Fixed at Top */}
            <div className="glass-panel p-4 flex flex-none items-center justify-between mx-2 mt-2 z-10 shrink-0">
                <div className="flex items-center gap-1">
                    <button onClick={() => router.push('/')} className="p-2 hover:bg-white/10 rounded-full">
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <button onClick={() => setIsConversationsOpen(true)} className="p-2 hover:bg-white/10 rounded-full text-purple-400">
                        <MessageCircle className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 text-center flex flex-col items-center justify-center">
                    <h1 className="font-bold text-lg leading-tight truncate px-2">{chatInfo?.name}</h1>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setIsPeopleOpen(true)}
                        className="p-2 hover:bg-white/10 rounded-full relative"
                    >
                        <Users className={`w-6 h-6 ${unreadUserIds.size > 0 && !isPeopleOpen ? 'text-purple-400 animate-pulse drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]' : 'text-purple-400'}`} />
                        {unreadUserIds.size > 0 && !isPeopleOpen && <span className="absolute top-0 right-0 w-3 h-3 bg-pink-500 rounded-full animate-ping" />}
                    </button>
                </div>
            </div>

            {/* Debugging Ownership */}
            {console.log("DEBUG ChatPage:", {
                userUid: user?.uid,
                creatorId: chatInfo?.creatorId,
                match: chatInfo?.creatorId === user?.uid
            })}

            <ConversationsModal
                isOpen={isConversationsOpen}
                onClose={() => setIsConversationsOpen(false)}
                user={user}
            />

            <PeopleListModal
                isOpen={isPeopleOpen}
                onClose={() => setIsPeopleOpen(false)}
                chatId={chatId}
                currentUserId={user?.uid}
                isCreator={chatInfo?.creatorId === user?.uid}
                creatorId={chatInfo?.creatorId}
                unreadUserIds={unreadUserIds}
                onDeleteChat={async () => {
                    await deleteChatFully(chatId);
                    router.push('/');
                }}
            />

            {/* Feed - Flexible Middle Area */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
                {posts.map(post => (
                    <PostItem
                        key={post.id}
                        post={post}
                        chatId={chatId}
                        currentUserId={user?.uid}
                        isOwner={chatInfo?.creatorId === user?.uid}
                    />
                ))}

                {posts.length === 0 && (
                    <div className="text-center text-gray-600 mt-10">Be the first to post!</div>
                )}
            </div>

            {/* Input Area - Flex Item, Fixed at Bottom */}
            <div className="w-full bg-black/80 backdrop-blur-md p-4 border-t border-white/10 flex-none z-20 pb-safe-area-inset-bottom">
                <div className="flex flex-col gap-1 w-full">
                    <div className="flex items-center gap-2 bg-white/5 rounded-2xl p-2 border border-white/10">
                        <input
                            type="text"
                            value={msgText}
                            onChange={e => setMsgText(e.target.value)}
                            placeholder="Drop a message..."
                            maxLength={200}
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
                    <div className={`text-[10px] text-right pr-2 transition-colors ${msgText.length >= 200 ? 'text-red-400 font-bold' : 'text-gray-600'}`}>
                        {msgText.length}/200
                    </div>
                </div>
            </div>
        </main>
    );
}
