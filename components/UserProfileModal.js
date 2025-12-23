'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Camera, Loader2, Save, LogOut, Trash2, Crown, Check, ChevronRight } from 'lucide-react';
import { updateProfile, GoogleAuthProvider, signInWithPopup, signOut, deleteUser } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { auth, storage, db } from '@/lib/firebase';

export default function UserProfileModal({ isOpen, onClose, user }) {
    const [name, setName] = useState('');
    const [photoPreview, setPhotoPreview] = useState(null);
    const [pendingFile, setPendingFile] = useState(null);
    const [userData, setUserData] = useState(null);
    const [status, setStatus] = useState('idle');
    const [errorMessage, setErrorMessage] = useState('');

    const fileInputRef = useRef(null);

    useEffect(() => {
        if (isOpen && user) {
            setName(user.displayName || '');
            setPhotoPreview(user.photoURL || null);
            setPendingFile(null);
            setStatus('idle');
            setErrorMessage('');

            const unsub = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
                setUserData(docSnap.data() || {});
            });
            return () => unsub();
        }
    }, [isOpen, user]);

    if (!isOpen) return null;

    const isPremium = userData?.subscriptionStatus === 'premium';
    const isAnonymous = user?.isAnonymous;

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) return alert("File max 5MB");
        setPhotoPreview(URL.createObjectURL(file));
        setPendingFile(file);
    };

    const handleSave = async () => {
        if (!auth.currentUser) return;
        setStatus('uploading_image');
        setErrorMessage('');
        try {
            let finalPhotoURL = user?.photoURL || null;
            if (pendingFile) {
                const storageRef = ref(storage, `avatars/${auth.currentUser.uid}/${Date.now()}_${pendingFile.name}`);
                const snapshot = await uploadBytes(storageRef, pendingFile);
                finalPhotoURL = await getDownloadURL(snapshot.ref);
            }
            setStatus('saving_profile');
            await updateProfile(auth.currentUser, {
                displayName: name.trim().substring(0, 30),
                photoURL: finalPhotoURL
            });
            await auth.currentUser.reload();
            setStatus('success');
            setTimeout(() => { onClose(); window.location.reload(); }, 800);
        } catch (error) {
            setStatus('error');
            setErrorMessage(error.message);
        }
    };

    const handleGoogleLogin = async () => {
        try {
            await signInWithPopup(auth, new GoogleAuthProvider());
        } catch (e) { alert(e.message); }
    };

    const handleDeleteAccount = async () => {
        if (!confirm("⚠️ PERMANENTLY DELETE ACCOUNT?\n\nThis will cancel subscriptions and wipe data.")) return;
        try {
            await deleteDoc(doc(db, "users", user.uid));
            await deleteUser(auth.currentUser);
            window.location.reload();
        } catch (e) { alert("Delete failed. Re-login required."); }
    };

    const handleSubscribe = async () => {
        setStatus('saving_profile');
        try {
            const res = await fetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.uid, priceId: 'price_1Q...', returnUrl: window.location.href })
            });
            const data = await res.json();
            if (data.url) window.location.href = data.url;
            else { alert(data.error); setStatus('idle'); }
        } catch (e) { setStatus('idle'); }
    };

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className={`glass-panel w-full max-w-sm p-6 flex flex-col gap-6 border shadow-2xl overflow-y-auto max-h-[90vh]
                ${isPremium ? 'border-yellow-500/50 shadow-yellow-500/20' : 'border-white/10'}
            `}>
                {/* Header */}
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        {isPremium && <Crown className="w-5 h-5 text-yellow-400 fill-yellow-400" />}
                        Profile
                    </h2>
                    <button onClick={onClose}><X className="text-gray-400 hover:text-white" /></button>
                </div>

                {/* 1. Avatar */}
                <div className="flex justify-center">
                    <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                        <div className={`w-28 h-28 rounded-full overflow-hidden border-4 ${status === 'uploading_image' ? 'border-yellow-400 animate-pulse' : (isPremium ? 'border-yellow-500' : 'border-purple-500/50')} shadow-lg bg-gray-800`}>
                            {photoPreview ? <img src={photoPreview} className="w-full h-full object-cover" /> :
                                <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-gray-500">{name ? name[0]?.toUpperCase() : '?'}</div>}
                        </div>
                        <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Camera className="w-8 h-8 text-white" />
                        </div>
                    </div>
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileSelect} />
                </div>

                {/* 2. Name & Save Button */}
                <div className="space-y-3">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Display Name</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-purple-500 outline-none" placeholder="Your Name" maxLength={30} />

                    <button onClick={handleSave} disabled={status !== 'idle' && status !== 'error'} className={`w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg ${status === 'success' ? 'bg-green-500 text-white' : 'bg-purple-600 text-white hover:bg-purple-500'}`}>
                        {status === 'saving_profile' || status === 'uploading_image' ? <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</> : status === 'success' ? <><Check className="w-5 h-5" /> Saved!</> : <><Save className="w-5 h-5" /> Save Changes</>}
                    </button>
                    {errorMessage && <p className="text-red-400 text-xs text-center">{errorMessage}</p>}
                </div>

                <div className="h-px bg-white/10" />

                {/* 3. Authentication (Continue With...) */}
                {isAnonymous ? (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 font-medium">SAVE YOUR ACCOUNT</span>
                        </div>
                        <button onClick={handleGoogleLogin} className="w-full py-3 bg-white text-black font-bold rounded-xl flex items-center justify-center gap-3 hover:bg-gray-200">
                            <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5" alt="G" /> Continue with Google
                        </button>
                    </div>
                ) : (
                    // 4. Upgrade Button (Only if NOT anonymous)
                    !isPremium ? (
                        <div onClick={handleSubscribe} className="cursor-pointer group relative overflow-hidden rounded-xl bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/20 p-4 hover:border-yellow-500/50 transition-all">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-yellow-500/20 rounded-lg text-yellow-500"><Crown className="w-5 h-5" /></div>
                                    <div><h3 className="font-bold text-white text-sm">Upgrade to Premium</h3><p className="text-xs text-gray-400">Unlimited chats & colors</p></div>
                                </div>
                                <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-yellow-500" />
                            </div>
                        </div>
                    ) : (
                        <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center gap-2">
                            <Check className="w-4 h-4 text-green-400" /> <span className="text-green-400 font-bold text-sm">Premium Active</span>
                        </div>
                    )
                )}

                {/* 5. Footer */}
                <div className="flex justify-between items-center pt-2 mt-auto">
                    <button onClick={() => signOut(auth).then(onClose)} className="text-xs font-medium text-gray-500 hover:text-white flex items-center gap-1.5 px-2 py-1"><LogOut className="w-3.5 h-3.5" /> Sign Out</button>
                    <button onClick={handleDeleteAccount} className="text-xs font-medium text-red-900/50 hover:text-red-500 flex items-center gap-1.5 px-2 py-1"><Trash2 className="w-3.5 h-3.5" /> Delete Account</button>
                </div>
            </div>
        </div>
    );
}
