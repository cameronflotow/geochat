'use client';

import { useState, useEffect } from 'react';
import { X, MessageCircle } from 'lucide-react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import PrivateChatModal from './PrivateChatModalV2';

export default function ConversationsModal({ isOpen, onClose, user }) {
    const [conversations, setConversations] = useState([]);
    const [selectedChat, setSelectedChat] = useState(null);
    const [isChatOpen, setIsChatOpen] = useState(false);

    useEffect(() => {
        if (!isOpen || !user) return;

        const q = query(
            collection(db, "conversations"),
            where("participants", "array-contains", user.uid),
            orderBy("lastMessageTimestamp", "desc")
        );

        const unsub = onSnapshot(q, (snapshot) => {
            const convs = snapshot.docs.map(doc => {
                const data = doc.data();
                // Identify Other User
                const otherUid = data.participants.find(p => p !== user.uid);
                // We'd ideally fetch their profile, but for now we might rely on cached names if stored on conv doc?
                // The current create logic doesn't store names on conv doc. 
                // We might need to fetch user profiles or just show "User".
                // TODO: Update create logic to store `participantNames` map or fetch here.
                // For "Lite", let's try to fetch or store? fetching N profiles is heavy.
                // Storing names on conversation creation/update is better.
                // Let's assume for now we just show "User" or wait for subsequent update that adds names.
                return { id: doc.id, ...data, otherUid };
            });
            setConversations(convs);
        });

        return () => unsub();
    }, [isOpen, user]);

    const handleSelect = (conv) => {
        // Mock Other User object for the modal
        // In a real app we'd fetch the user doc. 
        // "Lite": Just pass UID and let the modal handle it? 
        // PrivateChatModalV2 expects "otherUser" object with displayName/photoURL.
        // I will create a minimal object. 
        // OPTIMIZATION: Check if we have their name in the message history or store it on the conv.
        // For now, minimal object.
        setSelectedChat({
            id: conv.id,
            otherUser: {
                uid: conv.otherUid,
                displayName: "Chat Partner", // Placeholder
                photoURL: null
            }
        });
        setIsChatOpen(true);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className="glass-panel w-full max-w-sm p-4 relative h-[70vh] flex flex-col shadow-2xl">

                {/* Header */}
                <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-2">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <MessageCircle className="w-5 h-5 text-purple-400" />
                        Messages
                    </h2>
                    <button onClick={onClose} className="p-1 hover:text-white text-gray-400">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto space-y-2">
                    {conversations.length === 0 ? (
                        <div className="text-center text-gray-500 mt-10">No messages yet.</div>
                    ) : (
                        conversations.map(conv => {
                            // Check read status
                            const lastViewed = conv.lastViewed?.[user.uid]?.toMillis() || 0;
                            const lastUpdated = conv.lastMessageTimestamp?.toMillis() || 0;
                            const isUnread = lastUpdated > lastViewed;

                            return (
                                <div
                                    key={conv.id}
                                    onClick={() => handleSelect(conv)}
                                    className={`p-3 rounded-xl cursor-pointer hover:bg-white/10 border transition-all
                                        ${isUnread ? 'bg-purple-900/20 border-purple-500/50' : 'bg-transparent border-transparent'}
                                    `}
                                >
                                    <div className="flex justify-between items-center">
                                        <span className={`text-sm ${isUnread ? 'font-bold text-white' : 'text-gray-300'}`}>
                                            Partner {conv.otherUid.slice(0, 4)}...
                                            {/* Note: Without fetching profiles, names are missing. */}
                                        </span>
                                        {isUnread && <span className="w-2 h-2 bg-pink-500 rounded-full"></span>}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">
                                        {lastUpdated ? new Date(lastUpdated).toLocaleDateString() : ''}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {selectedChat && (
                <PrivateChatModal
                    isOpen={isChatOpen}
                    onClose={() => setIsChatOpen(false)}
                    conversationId={selectedChat.id}
                    otherUser={selectedChat.otherUser}
                    currentUserId={user?.uid}
                />
            )}
        </div>
    );
}
