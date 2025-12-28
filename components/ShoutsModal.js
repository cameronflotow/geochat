'use client';

import { useState } from 'react';
import { X, Megaphone, MapPin, Smile } from 'lucide-react';
import { collection, addDoc, serverTimestamp, doc, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { geohashForLocation } from 'geofire-common';
import { db, auth } from '@/lib/firebase';
import { useShouts } from '@/hooks/useShouts';
import PrivateChatModal from './PrivateChatModal';
import ShoutItem from './ShoutItem';
import EmojiInventoryGrid from './EmojiInventoryGrid';

export default function ShoutsModal({ isOpen, onClose, userLocation, user, shouts, loading, radius, setRadius }) {
    // UI State
    const [showRadiusMenu, setShowRadiusMenu] = useState(false);

    const [text, setText] = useState('');
    const [isPinned, setIsPinned] = useState(true);
    const [sending, setSending] = useState(false);

    // Private Chat State
    const [selectedUser, setSelectedUser] = useState(null);
    const [isPrivateChatOpen, setIsPrivateChatOpen] = useState(false);
    const [privateConversationId, setPrivateConversationId] = useState(null);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);

    if (!isOpen) return null;

    const handlePostCapped = async (text) => {
        setSending(true);
        try {
            // UNLIMITED SHOUTS (Restriction Removed)

            // Get User Style
            const userSnap = await getDoc(doc(db, "users", user.uid));
            const emojiStyle = userSnap.data()?.selectedEmoji || null;

            // Post
            const hash = geohashForLocation([userLocation.lat, userLocation.lng]);
            await addDoc(collection(db, "shouts"), {
                text: text,
                lat: userLocation.lat,
                lng: userLocation.lng,
                geohash: hash,
                userId: user.uid,
                userName: user.displayName || 'Anonymous',
                userPhoto: user.photoURL,
                isPinned: isPinned,
                emojiStyle: emojiStyle,
                createdAt: serverTimestamp(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // Auto-delete in 24h
            });

        } catch (e) {
            console.error(e);
            alert("Failed to shout. " + e.message);
        } finally {
            setSending(false);
            setText('');
            setIsPinned(true);
        }
    };

    const handleUserClick = async (shoutAuthorId, shoutAuthorName, shoutAuthorPhoto) => {
        if (shoutAuthorId === user?.uid) return;

        // UNLIMITED DMs (Restriction Removed)

        // Open Chat
        const sortedIds = [user.uid, shoutAuthorId].sort();
        const convId = `${sortedIds[0]}_${sortedIds[1]}`;

        setPrivateConversationId(convId);
        setSelectedUser({
            uid: shoutAuthorId,
            displayName: shoutAuthorName,
            photoURL: shoutAuthorPhoto
        });
        setIsPrivateChatOpen(true);

        // Ensure Doc
        try {
            await setDoc(doc(db, "conversations", convId), {
                participants: sortedIds,
                lastUpdated: serverTimestamp()
            }, { merge: true });
        } catch (e) { console.error(e); }
    };

    const handleLike = async (shout) => {
        if (!user) return;
        const shoutRef = doc(db, "shouts", shout.id);
        const isLiked = shout.likes?.includes(user.uid);

        if (isLiked) {
            await updateDoc(shoutRef, { likes: arrayRemove(user.uid) });
        } else {
            await updateDoc(shoutRef, { likes: arrayUnion(user.uid) });
        }
    };

    return (
        <div className="fixed inset-0 z-[1500] flex justify-center pointer-events-none">
            <div className="pointer-events-auto bg-black/80 backdrop-blur-xl w-full sm:max-w-md h-full border-x border-white/10 flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300">

                {/* Header */}
                <div className="p-5 border-b border-white/10 flex items-center justify-between bg-white/5 backdrop-blur-md sticky top-0 z-[100]">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-purple-500/20">
                            <Megaphone className="w-5 h-5" />
                        </div>
                        <h2 className="font-bold text-white text-lg">Local Shouts</h2>

                        <div className="relative">
                            <button
                                onClick={(e) => { e.stopPropagation(); setShowRadiusMenu(!showRadiusMenu); }}
                                className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded-full text-xs font-bold text-gray-300 hover:text-white transition-colors flex items-center gap-1 border border-white/5"
                            >
                                {radius}mi
                            </button>
                            {showRadiusMenu && (
                                <>
                                    <div className="fixed inset-0 z-[60]" onClick={(e) => { e.stopPropagation(); setShowRadiusMenu(false); }} />
                                    <div className="absolute top-full left-0 mt-2 bg-gray-900 border border-white/20 rounded-xl overflow-hidden shadow-2xl z-[70] min-w-[80px]">
                                        {[1, 5, 10].map(r => (
                                            <button
                                                key={r}
                                                onClick={(e) => { e.stopPropagation(); setRadius(r); setShowRadiusMenu(false); }}
                                                className={`w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-white/10 transition-colors ${radius === r ? 'text-purple-400 bg-white/5' : 'text-gray-400'}`}
                                            >
                                                {r}mi
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Feed */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-40 gap-3 text-gray-500">
                            <div className="w-6 h-6 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                            <span className="text-xs font-medium">Listening for shouts...</span>
                        </div>
                    ) : shouts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-60 text-center gap-4 px-8 opacity-60">
                            <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center">
                                <Megaphone className="w-8 h-8 text-gray-500" />
                            </div>
                            <div>
                                <h3 className="text-white font-bold mb-1">It's quiet here</h3>
                                <p className="text-sm text-gray-400">Be the first to shout something to everyone nearby!</p>
                            </div>
                        </div>
                    ) : (
                        shouts.map(shout => (
                            <ShoutItem
                                key={shout.id}
                                shout={shout}
                                user={user}
                                handleUserClick={handleUserClick}
                            />
                        ))
                    )}
                </div>

                <div className="p-4 bg-black/40 border-t border-white/10 backdrop-blur-md relative z-20">

                    {/* Emoji Picker Popover */}
                    {showEmojiPicker && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowEmojiPicker(false)} />
                            <div className="absolute bottom-full left-4 mb-2 w-64 animate-in slide-in-from-bottom-2 duration-200 z-50">
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

                    <div className="flex items-center gap-2 mb-2 px-1">
                        <button
                            onClick={() => setIsPinned(!isPinned)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${isPinned
                                ? 'bg-purple-500 text-white shadow-[0_0_10px_rgba(168,85,247,0.5)]'
                                : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                                }`}
                        >
                            <MapPin className="w-3 h-3" />
                            {isPinned ? 'Pinned to Map' : 'Pin to Map'}
                        </button>
                    </div>

                    <div className="relative flex gap-1 items-end">
                        <div className="relative flex-1 group min-w-0">
                            <input
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                placeholder="Shout..."
                                maxLength={200}
                                className="w-full bg-white/5 border border-white/10 rounded-xl pl-3 pr-10 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:bg-white/10 transition-all font-medium text-sm"
                                onKeyDown={(e) => e.key === 'Enter' && handlePostCapped(text)}
                            />
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded-md text-[10px] font-medium text-gray-500">
                                <span className={text.length >= 200 ? 'text-red-400' : ''}>{text.length}</span>/200
                            </div>
                        </div>

                        <button
                            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                            className={`p-2 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 shrink-0 ${showEmojiPicker ? 'bg-purple-500 text-white shadow-[0_0_15px_rgba(168,85,247,0.4)]' : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white'}`}
                        >
                            <Smile className="w-5 h-5" />
                        </button>

                        <button
                            onClick={() => handlePostCapped(text)}
                            disabled={!text.trim() || sending}
                            className="p-2 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-xl text-white shadow-lg shadow-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-purple-500/40 hover:scale-105 active:scale-95 transition-all duration-200 shrink-0"
                        >
                            {sending ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Megaphone className="w-5 h-5" />}
                        </button>
                    </div>
                </div>

                {/* Modals */}
                <PrivateChatModal
                    isOpen={isPrivateChatOpen}
                    onClose={() => setIsPrivateChatOpen(false)}
                    conversationId={privateConversationId}
                    otherUser={selectedUser}
                    currentUserId={user?.uid}
                />
            </div>
        </div>
    );
}
