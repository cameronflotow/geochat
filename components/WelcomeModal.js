'use client';

import { Shield, CheckCircle } from 'lucide-react';

export default function WelcomeModal({ isOpen, onAgree }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-300">
            <div className="glass-panel w-full max-w-md p-6 relative flex flex-col items-center text-center space-y-6 animate-in zoom-in-95 duration-300 border border-purple-500/30 shadow-[0_0_50px_rgba(168,85,247,0.2)]">

                {/* Header */}
                <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center border border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.3)] animate-pulse">
                        <Shield className="w-8 h-8 text-purple-300" />
                    </div>
                    <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-300 to-pink-300">
                        Welcome to Geochat
                    </h1>
                </div>

                {/* Terms */}
                <div className="text-left bg-white/5 rounded-2xl p-4 border border-white/10 w-full space-y-3 shadow-inner">
                    <p className="text-sm text-gray-300 leading-relaxed font-semibold">
                        By entering, you agree to the following Community Rules:
                    </p>
                    <ul className="space-y-3 text-sm text-gray-300">
                        <li className="flex items-start gap-2">
                            <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                            <span><strong className="text-white">Lawful Use:</strong> I will follow all local, state, and federal laws.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                            <span><strong className="text-white">Respect:</strong> I will not harass, bully, or abuse other users. Zero tolerance.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                            <span><strong className="text-white">Safety:</strong> I will keep content clean and appropriate for a public space.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                            <span><strong className="text-white">Liability:</strong> I understand this is a user-generated platform and I am responsible for my actions.</span>
                        </li>
                    </ul>
                </div>

                <div className="text-xs text-gray-500 max-w-xs">
                    Access is restricted until you agree to these terms.
                </div>

                {/* Action */}
                <button
                    onClick={onAgree}
                    className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-xl font-bold text-lg shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                    I Agree & Enter
                </button>
            </div>
        </div>
    );
}
