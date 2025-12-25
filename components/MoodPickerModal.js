'use client';

import { X, Trash2 } from 'lucide-react';

const MOODS = [
    // Top Faces
    '😀', '😃', '😄', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇',
    '🥰', '😍', '🤩', '😘', '😋', '😛', '😜', '🤪', '😝', '🤑',
    '🤗', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄',
    '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕',
    '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳',
    '😎', '🤓', '🧐', '😕', '😟', '🙁', '😮', '😯', '😲', '😳',
    '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖',
    '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬',
    '😈', '👿', '💀', '☠️', '💩', '🤡', '👻', '👽', '👾', '🤖',
    // Hands & Body
    '👋', '🤚', '🖐', '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟',
    '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '👍', '👎', '✊',
    '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️',
    '💪', '👀', '👁', '👄', '💋', '🩸',
    // Hearts & Symbols
    '💘', '💝', '💖', '💗', '💓', '💞', '💕', '💟', '❣️', '💔',
    '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💯',
    '💢', '💥', '💫', '💦', '💨', '🔥', '✨', '🌟', '⭐', '🎵',
    // Nature & Animals
    '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
    '🦁', '🐮', '🐷', '🐸', '🐵', '🦄', '🐝', '🦋', '💐', '🌸',
    '🌹', '🌻', '🌲', '🌵', '🌴', '🍁', '🍄', '🌍', '🪐', '🌙',
    // Food & Drink
    '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍒',
    '🍑', '🍆', '🍔', '🍟', '🍕', '🌭', '🥪', '🌮', '🌯', '🥗', '🍿',
    '🍷', '🥂', '🍻', '🍺', '🍹', '☕️', '🍩', '🍪', '🎂', '🍰',
    // Activities & Objects
    '⚽️', '🏀', '🏈', '⚾️', '🎾', '🏐', '🏉', '🎱', '🎮', '🕹️',
    '🎲', '🚗', '🚕', '🚙', '🚌', '🏎', '🚀', '🚁', '✈️', '⚓️',
    '⌚️', '📱', '💻', '💸', '💵', '💎', '💡', '💣', '💊', '🎈',
    '🎉', '🎊', '🎁', '🔮', '🧿', '🧬', '🦠', '💊', '💉', '🩸',
    // Custom
    '@', '#', '$', '67'
];

export default function MoodPickerModal({ isOpen, onClose, onDrop, onClear, hasActiveMood }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="glass-panel w-full max-w-sm p-6 relative flex flex-col max-h-[85vh]">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-white/70 hover:text-white"
                >
                    <X className="w-6 h-6" />
                </button>

                <h2 className="text-xl font-bold mb-1 text-center text-white">Drop a Mood</h2>
                <p className="text-gray-400 text-xs text-center mb-6">Visible to others for 2 hours</p>

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2 mb-6">
                    <div className="grid grid-cols-5 gap-3">
                        {MOODS.map(emoji => (
                            <button
                                key={emoji}
                                onClick={() => {
                                    onDrop(emoji);
                                    onClose();
                                }}
                                className="aspect-square flex items-center justify-center text-2xl bg-white/5 hover:bg-white/20 rounded-xl transition-all hover:scale-110 active:scale-95"
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                </div>

                {hasActiveMood && (
                    <button
                        onClick={() => {
                            onClear();
                            onClose();
                        }}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-red-500/10 border border-red-500/50 text-red-300 rounded-xl hover:bg-red-500/20 transition-all font-bold text-sm shrink-0"
                    >
                        <Trash2 className="w-4 h-4" />
                        Clear my Mood
                    </button>
                )}
            </div>
        </div>
    );
}
