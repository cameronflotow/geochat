'use client';

import { useState, useEffect } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Loader2 } from 'lucide-react';

export default function EmojiInventoryGrid({ userId, className = '', onSelect }) {
    const [userData, setUserData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!userId) return;
        const unsub = onSnapshot(doc(db, "users", userId), (docSnap) => {
            setUserData(docSnap.data() || {});
            setLoading(false);
        });
        return () => unsub();
    }, [userId]);

    const handleSelect = async (emoji) => {
        if (!userId) return;
        try {
            await updateDoc(doc(db, "users", userId), { selectedEmoji: emoji });
            if (onSelect) onSelect(emoji);
        } catch (e) {
            console.error("Failed to select emoji", e);
        }
    };

    if (loading) return <div className="flex justify-center p-4"><Loader2 className="w-6 h-6 animate-spin text-gray-500" /></div>;

    const inventory = userData?.inventory || {};
    const hasItems = Object.keys(inventory).length > 0;

    if (!hasItems) {
        return (
            <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-center">
                <div className="text-2xl mb-1 grayscale opacity-50">🥚</div>
                <p className="text-xs text-gray-500">No emojis collected yet.</p>
                <p className="text-[10px] text-gray-600 mt-1">Explore the map to find them!</p>
            </div>
        );
    }

    return (
        <div className={`bg-white/5 rounded-xl p-3 border border-white/5 ${className}`}>
            <div className="grid grid-cols-5 gap-2">
                {/* Default Option */}
                <div
                    onClick={() => handleSelect(null)}
                    className={`aspect-square flex flex-col items-center justify-center rounded-lg cursor-pointer transition-all border-2 ${!userData?.selectedEmoji
                        ? 'bg-white/10 border-white shadow-[0_0_10px_rgba(255,255,255,0.2)]'
                        : 'bg-white/5 border-white/5 hover:bg-white/10'
                        }`}
                    title="Default Style"
                >
                    <div className="w-6 h-6 rounded bg-gray-600" />
                </div>

                {(() => {
                    const entries = Object.entries(inventory);

                    // DEFAULTS (Always available)
                    const DEFAULTS = ['Wants 🍸', 'Wants 🎲', 'Wants 🎵', 'Wants 💃', 'Wants 🤫', 'Wants 🔥'];
                    const defaultEntries = DEFAULTS.filter(d => !inventory[d]).map(d => [d, 1]); // Mock count 1

                    // Split into Text vs Emoji
                    // Text items > 2 chars (e.g. "Complicated")
                    // Emoji items <= 2 chars (roughly, or just standard sort)
                    const textItems = [...entries, ...defaultEntries].filter(([k]) => Array.from(k).length > 2).sort((a, b) => a[0].localeCompare(b[0]));
                    const emojiItems = entries.filter(([k]) => Array.from(k).length <= 2).sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0])); // Stable sort based on counts then name

                    return [...textItems, ...emojiItems].map(([emoji, count]) => {
                        const isUltraRare = ['🍑', '🍆', '👽', '🦄', '🐲', '💎'].includes(emoji);
                        const isSelected = userData?.selectedEmoji === emoji;
                        const isText = Array.from(emoji).length > 2;

                        return (
                            <div
                                key={emoji}
                                onClick={() => handleSelect(emoji)}
                                className={`aspect-square flex flex-col items-center justify-center rounded-lg relative group cursor-pointer transition-all border-2
                                    ${isSelected
                                        ? 'bg-purple-500/20 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.4)]'
                                        : (isUltraRare ? 'bg-purple-500/10 border-purple-500/30' : 'bg-black/20 hover:bg-white/10 border-transparent')
                                    }
                                `}
                            >
                                <span className={`${isText ? 'text-[7px] font-bold leading-none text-center break-words w-full px-0.5 flex items-center justify-center h-full' : 'text-2xl'} drop-shadow-md select-none`}>{emoji}</span>
                                {!isText && <span className="text-[9px] font-bold text-gray-400 -mt-1">x{count}</span>}

                                {isUltraRare && (
                                    <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-yellow-400 rounded-full animate-pulse shadow-lg" title="Rare!" />
                                )}
                            </div>
                        );
                    });
                })()}
            </div>
        </div>
    );
}
