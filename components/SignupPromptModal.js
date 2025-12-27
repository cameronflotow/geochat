'use client';

import { Sparkles, UserPlus, X } from 'lucide-react';

export default function SignupPromptModal({ isOpen, onClose, onCreateAccount }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
            <div className="glass-panel w-full max-w-sm rounded-2xl border border-purple-500/30 shadow-2xl p-6 relative overflow-hidden">

                {/* Background Decor */}
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />

                <div className="relative z-10 flex flex-col items-center text-center">

                    <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-purple-500/30">
                        <Sparkles className="w-8 h-8 text-white" />
                    </div>

                    <h2 className="text-2xl font-bold text-white mb-2">Nice Find!</h2>
                    <p className="text-gray-300 text-sm mb-6 leading-relaxed">
                        You just collected your first emoji! <br />
                        Create an account now to save it forever.
                    </p>

                    <button
                        onClick={onCreateAccount}
                        className="w-full py-3 bg-white text-black font-bold rounded-xl hover:bg-gray-100 transition-all active:scale-95 shadow-lg flex items-center justify-center gap-2 mb-3"
                    >
                        <UserPlus className="w-5 h-5" />
                        Finish Creating Account
                    </button>

                    <button
                        onClick={onClose}
                        className="text-gray-500 text-sm font-medium hover:text-white transition-colors"
                    >
                        I'll do it later
                    </button>
                </div>

                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
}
