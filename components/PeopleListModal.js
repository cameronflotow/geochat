'use client';

import { useState, useEffect } from 'react';
import { X, MessageSquare, Trash2 } from 'lucide-react';
import { collection, query, where, onSnapshot, orderBy, addDoc, getDocs, serverTimestamp, setDoc, doc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import PrivateChatModal from './PrivateChatModalV2';

export default function PeopleListModal({ isOpen, onClose, chatId, currentUserId, isCreator, creatorId, onDeleteChat }) {
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [isPrivateChatOpen, setIsPrivateChatOpen] = useState(false);
    const [conversationId, setConversationId] = useState(null);

    // Debug Log
    console.log("DEBUG PeopleListModal:", { isCreator, currentUserId });

    useEffect(() => {
        if (!isOpen || !chatId) return;

        // Listen to presence
        // Ideally we filter by lastSeen > 5 mins ago, but client side filtering is easier for now
        const q = query(collection(db, "chats", chatId, "presence"), orderBy("lastSeen", "desc"));
        const unsub = onSnapshot(q, (snap) => {
            const active = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Filter if needed, e.g. difference < 5 mins
            setUsers(active);
        });
        return () => unsub();
    }, [isOpen, chatId]);

    const handleUserClick = async (otherUser) => {
        if (otherUser.uid === currentUserId) return;

        // Use Deterministic ID (Alpha-sort UIDs) to prevent duplicate conversations
        const sortedIds = [currentUserId, otherUser.uid].sort();
        const convId = `${sortedIds[0]}_${sortedIds[1]}`;

        try {
            console.log("DEBUG: Opening chat with", otherUser.uid);
            // OPTIMISTIC UPDATE: Open immediately, don't wait for server ack
            setConversationId(convId);
            setSelectedUser(otherUser);
            setIsPrivateChatOpen(true);

            // Background ensure existence
            setDoc(doc(db, "conversations", convId), {
                participants: sortedIds,
                lastUpdated: serverTimestamp()
            }, { merge: true }).catch(err => console.error("Error creating chat doc:", err));

        } catch (e) {
            console.error("Error preparing chat", e);
            alert("Could not open chat: " + e.message);
        }
    };

    if (!isOpen) return null;

    return (
        <>
            <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div className="glass-panel w-full max-w-sm p-4 relative animate-in fade-in zoom-in duration-200 max-h-[80vh] h-[70vh] flex flex-col">
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 text-white/70 hover:text-white z-10"
                    >
                        <X className="w-6 h-6" />
                    </button>

                    <h2 className="text-xl font-bold mb-4 text-center text-purple-300">
                        People Nearby
                    </h2>

                    <div className="flex-1 min-h-0 overflow-y-auto space-y-2 mb-4 pr-1">
                        {users.map(user => (
                            <div
                                key={user.uid}
                                onClick={() => handleUserClick(user)}
                                className={`flex items-center gap-3 p-3 rounded-xl transition-colors cursor-pointer ${user.uid === currentUserId ? 'bg-white/5 opacity-50 cursor-default' : 'hover:bg-white/10'}`}
                            >
                                <img src={user.photoURL || 'https://via.placeholder.com/40'} alt="" className="w-10 h-10 rounded-full border border-purple-500/30 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-sm text-white truncate">{user.displayName}</div>
                                    <div className="text-xs text-gray-400">Online</div>
                                </div>
                                {user.uid !== currentUserId && <MessageSquare className="w-4 h-4 text-gray-500" />}
                            </div>
                        ))}
                    </div>

                    <div className="pt-2 border-t border-white/10 shrink-0">
                        {isCreator ? (
                            <button
                                onClick={onDeleteChat}
                                className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl flex items-center justify-center gap-2 transition-colors font-bold text-sm border border-red-500/30"
                            >
                                <Trash2 className="w-4 h-4" />
                                Delete Chat
                            </button>
                        ) : (
                            <div className="text-center py-2">
                                <p className="text-xs text-gray-500">Only the chat creator can delete this chat.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <PrivateChatModal
                isOpen={isPrivateChatOpen}
                onClose={() => setIsPrivateChatOpen(false)}
                conversationId={conversationId}
                otherUser={selectedUser}
                currentUserId={currentUserId}
            />
        </>
    );
}
