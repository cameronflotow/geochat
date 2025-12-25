'use client';

import { useState, useEffect, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Users, Send, Heart, Trash2, Smile, X } from 'lucide-react';
import { doc, getDoc, collection, addDoc, serverTimestamp, deleteDoc, setDoc, query, where, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth'; // Import auth listener
import { db, auth } from '@/lib/firebase';
import { useLocation } from '@/hooks/useLocation';
import { usePosts } from '@/hooks/usePosts';
import UserProfileModal from '@/components/UserProfileModal';
import PostItem from '@/components/PostItem';
import PeopleListModal from '@/components/PeopleListModal';
import EmojiInventoryGrid from '@/components/EmojiInventoryGrid';
import { deleteChatFully, deletePostFully } from '@/lib/db-cleanup';

export default function ChatPage({ params }) {
    const { id: chatId } = use(params);
    const { location } = useLocation();
    const { posts, loading: postsLoading } = usePosts(chatId);
    const router = useRouter();

    console.log("ChatPage Render. ID:", chatId);

    const [chatInfo, setChatInfo] = useState(null);
    const [msgText, setMsgText] = useState('');
    const [sending, setSending] = useState(false);
    const [user, setUser] = useState(null);
    const [isPeopleOpen, setIsPeopleOpen] = useState(false);
    const [unreadUserIds, setUnreadUserIds] = useState(new Set());
    const [hasCheckedNotifications, setHasCheckedNotifications] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);

    // Listen for Unread PMs in this Chat
    useEffect(() => {
        if (!user || !chatId) return;

        // Query conversations linked to this chat where I am a participant
        const q = query(
            collection(db, "conversations"),
            where("participants", "array-contains", user.uid),
            where("chatId", "==", chatId)
        );

        const unsub = onSnapshot(q, (snap) => {
            const unread = new Set();
            snap.docs.forEach(doc => {
                const data = doc.data();
                // Check if last message was NOT from me
                if (data.lastSenderId && data.lastSenderId !== user.uid) {
                    // Check if I have viewed it since the last update
                    const myLastView = data.lastViewed?.[user.uid]?.toMillis() || 0;
                    const lastUpdate = data.lastUpdated?.toMillis() || 0;
                    if (lastUpdate > myLastView) {
                        // Find the other participant ID to mark as unread
                        const otherUid = data.participants.find(p => p !== user.uid);
                        if (otherUid) unread.add(otherUid);
                    }
                }
            });
            setUnreadUserIds(unread);
        });
        return () => unsub();
    }, [user, chatId]);

    // Auth
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (u) => {
            if (u) setUser(u);
            else router.push('/');
        });
        return () => unsub();
    }, [router]);



    // Clear Notifications for this chat
    useEffect(() => {
        if (!user || !chatId || hasCheckedNotifications) return;

        const q = query(
            collection(db, "users", user.uid, "notifications"),
            where("chatId", "==", chatId),
            where("read", "==", false)
        );

        getDoc(doc(db, "chats", chatId)).then(() => {
            // Just marking local state as checked, real cleanup implies batch update if we wanted.
            setHasCheckedNotifications(true);
        });

        // Note: Real "mark as read" logic usually happens on server or via batch here. 
        // For now, simpler:
        onSnapshot(q, (snap) => {
            snap.docs.forEach(d => {
                deleteDoc(d.ref).catch(console.error);
            });
        });

    }, [user, chatId]);

    // Presence Logic
    useEffect(() => {
        if (!chatId || !user) return;

        const userRef = doc(db, "chats", chatId, "presence", user.uid);

        // Mark active
        setDoc(userRef, {
            uid: user.uid,
            displayName: user.displayName || 'Anonymous',
            photoURL: user.photoURL,
            lastSeen: serverTimestamp()
        }, { merge: true }).catch(console.error);

        // Remove on exit
        return () => {
            deleteDoc(userRef).catch(console.error);
        };
    }, [chatId, user]);

    // Chat Info Listener
    useEffect(() => {
        if (!chatId) return;
        const unsub = onSnapshot(doc(db, "chats", chatId), (snapshot) => {
            if (snapshot.exists()) {
                setChatInfo({ id: snapshot.id, ...snapshot.data() });
            } else {
                console.log("Chat does not exist");
                setChatInfo(null);
            }
        }, (error) => {
            console.error("Error fetching chat:", error);
        });
        return () => unsub();
    }, [chatId]);

    // Geofence Check
    useEffect(() => {
        if (!chatInfo || !location) return;

        const dist = getDistanceFromLatLonInM(location.lat, location.lng, chatInfo.lat, chatInfo.lng);
        // If > radius + 50m buffer
        if (dist > (chatInfo.radius + 50)) {
            // Optional: Redirect or Warning. 
            // For stability, we won't auto-kick yet, just log or warn?
            // User complained about "broken", so maybe auto-kick was the annoyance?
            // "wont open dropped chats".
            // I'll leave it as a log for now to prevent blocking entry if GPS drifts.
            console.log(`User is ${Math.round(dist)}m away (Radius: ${chatInfo.radius}m)`);
        }
    }, [chatInfo, location]);

    const handlePost = async () => {
        if (!msgText.trim() || !user) return;

        // One-time Reminder
        const hasSeenReminder = localStorage.getItem('geochat_profile_reminder');
        const isDefaultProfile = !user.photoURL || !user.displayName || user.displayName === 'Anonymous';

        if (!hasSeenReminder && isDefaultProfile) {
            localStorage.setItem('geochat_profile_reminder', 'true');
            alert("✨ Express Yourself!\n\nYou can update your name and photo by clicking the Profile icon on the map screen.");
        }

        try {
            setSending(true);

            // Rolling Window Logic
            const MAX_POSTS = 300;
            if (posts.length >= MAX_POSTS) {
                const oldestPost = posts[posts.length - 1];
                if (oldestPost) {
                    deletePostFully(chatId, oldestPost.id).catch(console.error);
                }
            }

            // Get User Style
            const userSnap = await getDoc(doc(db, "users", user.uid));
            const emojiStyle = userSnap.data()?.selectedEmoji || null;

            await addDoc(collection(db, "chats", chatId, "posts"), {
                text: msgText,
                creatorId: user.uid,
                creatorName: user.displayName || 'Anonymous',
                creatorPhoto: user.photoURL,
                emojiStyle: emojiStyle,
                createdAt: serverTimestamp(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
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

    // Timeout Check
    const [showTimeoutMsg, setShowTimeoutMsg] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setShowTimeoutMsg(true), 5000);
        return () => clearTimeout(timer);
    }, []);

    if (!chatInfo) return (
        <div className="h-screen w-screen bg-black flex flex-col items-center justify-center space-y-4 p-4">
            <div className="text-purple-500 animate-pulse text-xl font-bold">Loading Chat...</div>
            <div className="text-gray-500 text-sm max-w-xs text-center">Connecting to secure frequency...</div>

            {showTimeoutMsg && (
                <div className="flex flex-col items-center gap-3 animate-in fade-in pt-4">
                    <p className="text-red-400 text-sm">Request timed out or chat not found.</p>
                    <button
                        onClick={() => router.push('/')}
                        className="px-4 py-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors text-sm"
                    >
                        Return to Map
                    </button>
                    <button
                        onClick={() => window.location.reload()}
                        className="text-xs text-gray-500 underline"
                    >
                        Reload Page
                    </button>
                </div>
            )}
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
                </div>

                <div className="flex-1 text-center flex flex-col items-center justify-center min-w-0">
                    <h1 className="font-bold text-lg leading-tight truncate px-2 w-full">{chatInfo?.name}</h1>
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
            <div className="w-full bg-black/80 backdrop-blur-md p-2 border-t border-white/10 flex-none z-20 pb-safe-area-inset-bottom">
                {/* Emoji Picker Popover */}
                {showEmojiPicker && (
                    <>
                        <div className="fixed inset-0 z-20" onClick={() => setShowEmojiPicker(false)} />
                        <div className="absolute bottom-24 left-4 mb-2 w-64 animate-in slide-in-from-bottom-2 duration-200 z-30">
                            <div className="bg-black/90 backdrop-blur-xl border border-white/20 rounded-2xl p-3 shadow-2xl">
                                <div className="flex justify-between items-center mb-2 px-1">
                                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Choose Style</span>
                                    <button onClick={() => setShowEmojiPicker(false)} className="text-gray-500 hover:text-white"><X className="w-3 h-3" /></button>
                                </div>
                                <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                    <EmojiInventoryGrid userId={user?.uid} onSelect={() => setShowEmojiPicker(false)} />
                                </div>
                            </div>
                        </div>
                    </>
                )}
                <div className="flex flex-col gap-1 w-full">
                    <div className="flex items-center gap-1 bg-white/5 rounded-2xl p-2 border border-white/10">
                        <input
                            type="text"
                            value={msgText}
                            onChange={e => setMsgText(e.target.value)}
                            placeholder="Drop a message..."
                            maxLength={200}
                            className="flex-1 bg-transparent border-none focus:outline-none px-2 text-white placeholder-gray-500 min-w-0"
                            onKeyDown={e => e.key === 'Enter' && handlePost()}
                        />

                        <button
                            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                            className={`p-2 rounded-xl transition-all active:scale-95 flex items-center justify-center shrink-0
                                ${showEmojiPicker ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20' : 'bg-transparent text-gray-400 hover:text-white hover:bg-white/10'}`}
                        >
                            <Smile className="w-5 h-5" />
                        </button>

                        <button
                            onClick={handlePost}
                            disabled={!msgText.trim() || sending}
                            className="p-2 bg-gradient-to-br from-purple-600 to-pink-600 rounded-xl text-white disabled:opacity-50 shrink-0"
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
