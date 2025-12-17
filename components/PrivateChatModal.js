'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { X, Send } from 'lucide-react';
import { collection, query, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, orderBy } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';

export default function PrivateChatModal({ isOpen, onClose, conversationId, otherUser, currentUserId }) {
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const scrollRef = useRef(null);

    // 1. Live Message Sync
    useEffect(() => {
        if (!isOpen || !conversationId) return;

        // Order by createdAt ensures "last message" is actually the last one
        const q = query(
            collection(db, "conversations", conversationId, "messages"),
            orderBy("createdAt", "asc")
        );

        const unsub = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setMessages(msgs);

            // Auto-scroll on new message
            if (scrollRef.current) {
                setTimeout(() => {
                    if (scrollRef.current) {
                        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                    }
                }, 100);
            }
        });

        return () => unsub();
    }, [isOpen, conversationId]);


    // 2. Strict Turn Logic (The Core Fix)
    // Rule: You can only send if the LAST message is NOT from you.
    const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
    const isMyTurn = !lastMsg || lastMsg.senderId !== currentUserId;

    // We are blocked if it's not our turn OR we are currently in the process of sending
    const canSend = isMyTurn && !isSending;


    const handleSend = async () => {
        if (!text.trim() || !canSend) return;

        const msgText = text;
        setText('');
        setIsSending(true); // Locks Input Instantly

        // Optimistic UI:
        // We could manually append to 'messages' here for instant visual feedback,
        // but since we are relying on 'messages' for the LOCK logic, we let Firestore's
        // onSnapshot (which has latency compensation) handle the list update.
        // However, setting isSending(true) provides the immediate "Lock".

        try {
            // 1. Send Message
            const msgData = {
                text: msgText,
                senderId: currentUserId,
                senderName: auth.currentUser?.displayName || 'Anonymous',
                createdAt: serverTimestamp()
            };

            await addDoc(collection(db, "conversations", conversationId, "messages"), msgData);

            // 2. Update Conversation Meta (Optional for this logic, but good for People List)
            updateDoc(doc(db, "conversations", conversationId), {
                lastSenderId: currentUserId,
                lastMessageTimestamp: serverTimestamp()
            }).catch(e => console.warn("Meta update failed", e)); // non-blocking

        } catch (error) {
            console.error("Send failed", error);
            alert("Failed to send message");
            setIsSending(false); // Unlock on error
        } finally {
            // We don't unlock here! 
            // We stay locked until the message arrives in the 'messages' list via onSnapshot.
            // Once it arrives, 'lastMsg' becomes ME, so 'isMyTurn' becomes FALSE.
            // So we are correctly locked.
            setIsSending(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <div className="glass-panel w-full max-w-sm p-4 relative max-h-[80vh] h-[70vh] flex flex-col animate-in fade-in zoom-in duration-200">

                {/* Header */}
                <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <img src={otherUser?.photoURL || 'https://via.placeholder.com/40'} className="w-10 h-10 rounded-full border border-purple-500/30" />
                            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-black"></div>
                        </div>
                        <div>
                            <span className="font-bold text-white block leading-tight">{otherUser?.displayName}</span>
                            <span className="text-[10px] text-gray-400 uppercase tracking-wider">Private Chat V2 (Clean)</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition-colors">
                        <X className="w-6 h-6 text-gray-400" />
                    </button>
                </div>

                {/* Messages */}
                <div className="flex-1 min-h-0 overflow-y-auto space-y-3 p-2 pr-1" ref={scrollRef}>
                    {messages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-50 space-y-2">
                            <div className="text-4xl">👋</div>
                            <div className="text-sm">No messages yet</div>
                        </div>
                    )}

                    {messages.map((msg, idx) => {
                        const isMe = msg.senderId === currentUserId;
                        const isSequence = idx > 0 && messages[idx - 1].senderId === msg.senderId;
                        return (
                            <div key={msg.id || idx} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2`}>
                                <div className={`max-w-[85%] px-4 py-2.5 text-sm break-words shadow-sm
                                    ${isMe
                                        ? 'bg-purple-600 text-white rounded-2xl rounded-tr-sm'
                                        : 'bg-[#2a2a2a] text-gray-100 rounded-2xl rounded-tl-sm border border-white/5'}
                                    ${isSequence ? (isMe ? 'mt-1 rounded-tr-2xl' : 'mt-1 rounded-tl-2xl') : ''}
                                `}>
                                    {msg.text}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Input */}
                <div className="mt-3 pt-3 border-t border-white/10 shrink-0">
                    {/* Status Indicator */}
                    {!canSend && (
                        <div className="flex items-center justify-center gap-2 mb-2">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-pink-500"></span>
                            </span>
                            <span className="text-xs text-pink-300 font-medium">Waiting for them to reply...</span>
                        </div>
                    )}

                    <div className="flex gap-2 items-end">
                        <input
                            className={`flex-1 bg-white/5 rounded-2xl px-4 py-3 border text-sm focus:outline-none transition-all
                                ${canSend
                                    ? 'border-white/10 focus:border-purple-500/50 focus:bg-white/10 text-white'
                                    : 'border-transparent bg-black/20 text-gray-500 cursor-not-allowed opacity-50'
                                }`}
                            placeholder={canSend ? "Type a message..." : "It's their turn"}
                            value={text}
                            onChange={e => setText(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSend()}
                            disabled={!canSend}
                            autoComplete="off"
                        />
                        <button
                            onClick={handleSend}
                            disabled={!text.trim() || !canSend}
                            className="p-3 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-xl text-white shadow-lg shadow-purple-500/20 disabled:opacity-50 disabled:shadow-none transition-all active:scale-95 flex items-center justify-center"
                        >
                            <Send className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
