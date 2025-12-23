'use client';

import { X, Copy, Check } from 'lucide-react';
import { useState } from 'react';

export default function ShareModal({ isOpen, onClose }) {
    const [copied, setCopied] = useState(false);
    const SHARE_URL = 'https://geochat.space';

    if (!isOpen) return null;

    const handleCopy = () => {
        navigator.clipboard.writeText(SHARE_URL);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="glass-panel w-full max-w-sm p-6 relative flex flex-col items-center space-y-6">

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
                >
                    <X className="w-6 h-6" />
                </button>

                {/* Header */}
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
                        Share Geochat
                    </h2>
                    <p className="text-gray-400 text-sm mt-1">Invite friends to join the map!</p>
                </div>

                {/* QR Code */}
                <div className="p-4 bg-white rounded-xl shadow-lg shadow-purple-500/20">
                    <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(SHARE_URL)}&bgcolor=ffffff&color=000000&margin=0`}
                        alt="QR Code"
                        className="w-48 h-48"
                    />
                </div>

                {/* Copy Link Button */}
                <button
                    onClick={handleCopy}
                    className="w-full btn-primary flex items-center justify-center gap-2 py-3 shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 active:scale-95 transition-all text-white font-bold rounded-xl"
                >
                    {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                    {copied ? 'Copied!' : 'Copy Link'}
                </button>

            </div>
        </div>
    );
}
