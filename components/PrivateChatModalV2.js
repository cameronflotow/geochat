import { useState, useEffect, useRef, useMemo } from 'react';
import { X, Send, Trash2 } from 'lucide-react';
import { collection, query, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, orderBy, deleteDoc, limitToLast } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';

export default function PrivateChatModalV2({ isOpen, onClose, conversationId, otherUser, currentUserId }) {
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const scrollRef = useRef(null);

    // 1. Live Message Sync
    useEffect(() => {
        if (!isOpen || !conversationId) return;

        // Verify user is authenticated
        if (!currentUserId && !auth.currentUser) return;

        // Optimization: Limit to last 50 messages
        const q = query(
            collection(db, "conversations", conversationId, "messages"),
            orderBy("createdAt", "asc"),
            limitToLast(50)
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
        }, (err) => {
            console.error("Error fetching messages:", err);
        });

        return () => unsub();
    }, [isOpen, conversationId, currentUserId]);


    // 1.5 Real-time Read Receipts
    // When messages update (new message arrives), if we are viewing it, mark as read.
    useEffect(() => {
        if (!isOpen || !conversationId || messages.length === 0) return;

        const lastMsg = messages[messages.length - 1];
        if (lastMsg.senderId !== currentUserId) {
            // Only update if not already read? 
            // Firestore writes are charged, so maybe debounce or check locally? 
            // For now, keep it simple but maybe add a check if we can track 'lastReadTime'.
            // But this is fine for "Lite" if traffic is low.
            updateDoc(doc(db, "conversations", conversationId), {
                [`lastViewed.${currentUserId}`]: serverTimestamp()
            }).catch(err => console.error("Error updating read receipt:", err));
        }
    }, [messages, isOpen, conversationId, currentUserId]);

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

        try {
            // REMOVED: Legacy "Rolling Window (Limit 5)" deletion logic.

            // 1. Send Message
            const msgData = {
                text: msgText,
                senderId: currentUserId,
                senderName: auth.currentUser?.displayName || 'Anonymous',
                createdAt: serverTimestamp()
            };

            await addDoc(collection(db, "conversations", conversationId, "messages"), msgData);

            // 2. Update Conversation Meta
            updateDoc(doc(db, "conversations", conversationId), {
                lastSenderId: currentUserId,
                lastMessageTimestamp: serverTimestamp(),
                [`lastViewed.${currentUserId}`]: serverTimestamp() // FORCE READ RECEIPT FOR SENDER
            }).catch(e => console.warn("Meta update failed", e)); // non-blocking

        } catch (error) {
            console.error("Send failed", error);
            alert("Failed to send message: " + error.message);
            setIsSending(false); // Unlock on error
        } finally {
            // Remain locked until snapshot updates
            setIsSending(false);
        }
    };

    const handleDelete = async (msgId) => {
        if (!confirm("Delete this message?")) return;
        try {
            await deleteDoc(doc(db, "conversations", conversationId, "messages", msgId));
        } catch (e) {
            console.error("Error deleting message:", e);
            alert("Could not delete message.");
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <div className="glass-panel w-full max-w-sm p-4 relative max-h-[80vh] h-[70vh] flex flex-col animate-in fade-in zoom-in duration-200 border border-purple-500/30 shadow-2xl">

                {/* Header */}
                <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            {otherUser?.photoURL ? (
                                <img src={otherUser.photoURL} className="w-10 h-10 rounded-full border border-purple-500/30 object-cover" />
                            ) : (
                                <div className="w-10 h-10 rounded-full border border-purple-500/30 flex items-center justify-center bg-gray-700 text-white font-bold">
                                    {otherUser?.displayName?.[0]?.toUpperCase() || '?'}
                                </div>
                            )}
                            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-black"></div>
                        </div>
                        <div>
                            <span className="font-bold text-white block leading-tight">{otherUser?.displayName}</span>
                            <span className="text-[10px] text-gray-400 uppercase tracking-wider">Private Chat</span>
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
                            <div key={msg.id || idx} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 group`}>
                                <div className={`max-w-[85%] px-4 py-2.5 text-sm break-words shadow-sm relative
                                    ${isMe
                                        ? 'bg-purple-600 text-white rounded-2xl rounded-tr-sm'
                                        : 'bg-[#2a2a2a] text-gray-100 rounded-2xl rounded-tl-sm border border-white/5'}
                                    ${isSequence ? (isMe ? 'mt-1 rounded-tr-2xl' : 'mt-1 rounded-tl-2xl') : ''}
                                `}>
                                    {msg.text}

                                    {/* Delete Button (Only for own messages) */}
                                    {isMe && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDelete(msg.id); }}
                                            className="absolute -left-8 top-1/2 -translate-y-1/2 p-1 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/10 rounded-full"
                                            title="Delete"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    )}
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

                    <div className="flex flex-col gap-1 w-full">
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
                                maxLength={200}
                            />
                            <button
                                onClick={handleSend}
                                disabled={!text.trim() || !canSend}
                                className="p-3 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-xl text-white shadow-lg shadow-purple-500/20 disabled:opacity-50 disabled:shadow-none transition-all active:scale-95 flex items-center justify-center"
                            >
                                <Send className="w-5 h-5" />
                            </button>
                        </div>
                        <div className={`text-[10px] text-right pr-2 transition-colors ${text.length >= 200 ? 'text-red-400 font-bold' : 'text-gray-600'}`}>
                            {text.length}/200
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
