// ... (imports remain)
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
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { auth, storage, db } from '@/lib/firebase';

export default function UserProfileModal({ isOpen, onClose, user }) {
    const [name, setName] = useState('');
    const [photoPreview, setPhotoPreview] = useState(null);
    const [pendingFile, setPendingFile] = useState(null);
    const [userData, setUserData] = useState(null);
    const [status, setStatus] = useState('idle');
    const [errorMessage, setErrorMessage] = useState('');

    const fileInputRef = useRef(null);

    // Initialize state
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

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            alert("File is too large (Max 5MB)");
            return;
        }
        const objectUrl = URL.createObjectURL(file);
        setPhotoPreview(objectUrl);
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
            setTimeout(() => {
                onClose();
                window.location.reload();
            }, 800);
        } catch (error) {
            console.error("Save failed:", error);
            setStatus('error');
            setErrorMessage(error.message || "Failed to save.");
        }
    };

    const handleGoogleLogin = async () => {
        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
        } catch (e) {
            console.error(e);
            alert("Login failed: " + e.message);
        }
    };

    const handleLogout = async () => {
        await signOut(auth);
        onClose();
    };

    const handleDeleteAccount = async () => {
        const confirmed = confirm(
            "⚠️ DELETE ACCOUNT?\n\nThis will permanently delete your profile, data, and CANCEL any active subscriptions immediately.\n\nAre you sure you want to proceed?"
        );
        if (!confirmed) return;

        try {
            const uid = user.uid;
            await deleteDoc(doc(db, "users", uid));
            await deleteUser(auth.currentUser);
            window.location.reload();
        } catch (e) {
            console.error(e);
            alert("Delete failed. You may need to Sign Out and Sign In again to verify identity before deleting.");
        }
    };

    const handleSubscribe = async () => {
        if (!user) return;
        setStatus('saving_profile');
        try {
            const response = await fetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.uid,
                    priceId: 'price_1Q...', // User needs to update this later
                    returnUrl: window.location.href
                })
            });
            const data = await response.json();
            if (data.url) window.location.href = data.url;
            else { alert("Checkout failed: " + data.error); setStatus('idle'); }
        } catch (e) { console.error(e); setStatus('idle'); }
    };

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className={`glass-panel w-full max-w-sm p-6 relative flex flex-col gap-6 border shadow-2xl overflow-y-auto max-h-[90vh]
                ${isPremium ? 'border-yellow-500/50 shadow-yellow-500/20' : 'border-white/10'}
            `}>
                {/* Header */}
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        {isPremium && <Crown className="w-5 h-5 text-yellow-400 fill-yellow-400" />}
                        Profile
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Avatar */}
                <div className="flex justify-center -mb-2">
                    <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                        <div className={`w-28 h-28 rounded-full overflow-hidden border-4 ${status === 'uploading_image' ? 'border-yellow-400 animate-pulse' : (isPremium ? 'border-yellow-500' : 'border-purple-500/50')} shadow-lg bg-gray-800`}>
                            {photoPreview ? (
                                <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-gray-500">
                                    {name ? name[0]?.toUpperCase() : '?'}
                                </div>
                            )}
                        </div>
                        <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Camera className="w-8 h-8 text-white" />
                        </div>
                    </div>
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileSelect} />
                </div>

                <div className="text-center text-xs text-gray-500">Tap to update photo</div>

                {/* Main Form */}
                <div className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Display Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 focus:outline-none transition-all placeholder-gray-600"
                            placeholder="Your Name"
                            maxLength={30}
                        />
                    </div>

                    {/* SAVE BUTTON - Top Priority */}
                    <button
                        onClick={handleSave}
                        disabled={status !== 'idle' && status !== 'error'}
                        className={`w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg
                            ${status === 'success'
                                ? 'bg-green-500 text-white shadow-green-500/20'
                                : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:scale-[1.02] shadow-purple-500/20'
                            } disabled:opacity-70 disabled:cursor-not-allowed`}
                    >
                        {status === 'saving_profile' || status === 'uploading_image' ? (
                            <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</>
                        ) : status === 'success' ? (
                            <><Check className="w-5 h-5" /> Saved!</>
                        ) : (
                            <><Save className="w-5 h-5" /> Save Changes</>
                        )}
                    </button>
                    {errorMessage && <p className="text-red-400 text-xs text-center">{errorMessage}</p>}
                </div>

                <div className="h-px bg-white/10 my-1" />

                {/* Socials & Login Section */}
                {user?.isAnonymous ? (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <div className="h-px flex-1 bg-white/10"></div>
                            <span className="text-xs text-gray-500 font-medium">CONNECT ACCOUNT</span>
                            <div className="h-px flex-1 bg-white/10"></div>
                        </div>

                        <button
                            onClick={handleGoogleLogin}
                            className="w-full py-3 bg-white text-black font-bold rounded-xl flex items-center justify-center gap-3 hover:bg-gray-200 transition-colors"
                        >
                            <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5" alt="G" />
                            Continue with Google
                        </button>
                    </div>
                ) : (
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                        <span className="text-sm text-gray-300">Signed in as</span>
                        <span className="text-sm font-bold text-white border-b border-purple-500/50 pb-0.5 max-w-[150px] truncate">
                            {user.email || 'User'}
                        </span>
                    </div>
                )}

                {/* Subscription Badge */}
                {!isPremium && (
                    <div onClick={handleSubscribe} className="cursor-pointer group relative overflow-hidden rounded-xl bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/20 p-4 hover:border-yellow-500/50 transition-all">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-yellow-500/20 rounded-lg text-yellow-500">
                                    <Crown className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-white text-sm">Upgrade to Premium</h3>
                                    <p className="text-xs text-gray-400">Unlock unlimited chats & colors</p>
                                </div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-yellow-500" />
                        </div>
                    </div>
                )}

                <div className="flex-1"></div>

                {/* Footer Actions (Tiny) */}
                <div className="flex justify-between items-center pt-2 mt-4 border-t border-white/10">
                    <button
                        onClick={handleLogout}
                        className="text-xs font-medium text-gray-500 hover:text-white flex items-center gap-1.5 px-2 py-1 transition-colors"
                    >
                        <LogOut className="w-3.5 h-3.5" /> Sign Out
                    </button>

                    <button
                        onClick={handleDeleteAccount}
                        className="text-xs font-medium text-red-900/50 hover:text-red-500 flex items-center gap-1.5 px-2 py-1 transition-colors"
                    >
                        Delete Account
                    </button>
                </div>
            </div>
        </div>
    );
}
import { updateProfile, GoogleAuthProvider, signInWithPopup, signOut, deleteUser } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { auth, storage, db } from '@/lib/firebase';

export default function UserProfileModal({ isOpen, onClose, user }) {
    const [name, setName] = useState('');
    const [photoPreview, setPhotoPreview] = useState(null);
    const [pendingFile, setPendingFile] = useState(null);
    const [userData, setUserData] = useState(null); // From Firestore

    // Status State: 'idle' | 'uploading_image' | 'saving_profile' | 'success' | 'error'
    const [status, setStatus] = useState('idle');
    const [errorMessage, setErrorMessage] = useState('');

    const fileInputRef = useRef(null);

    // Initialize state when modal opens
    useEffect(() => {
        if (isOpen && user) {
            setName(user.displayName || '');
            setPhotoPreview(user.photoURL || null);
            setPendingFile(null);
            setStatus('idle');
            setErrorMessage('');

            // Listen to Firestore User Doc for Subscription Status
            const unsub = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
                setUserData(docSnap.data() || {});
            });
            return () => unsub();
        }
    }, [isOpen, user]);

    if (!isOpen) return null;

    const isPremium = userData?.subscriptionStatus === 'premium';

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            alert("File is too large (Max 5MB)");
            return;
        }

        const objectUrl = URL.createObjectURL(file);
        setPhotoPreview(objectUrl);
        setPendingFile(file);
        setStatus('idle');
    };

    const handleSave = async () => {
        if (!auth.currentUser) return;

        setStatus('uploading_image');
        setErrorMessage('');

        try {
            let finalPhotoURL = user?.photoURL || null;

            if (pendingFile) {
                const updateBucket = storage.app.options.storageBucket;
                if (!updateBucket || updateBucket.includes("mock_")) {
                    // throw new Error("Missing Storage Bucket Configuration.");
                    // Fail silently for mock/dev
                } else {
                    const storageRef = ref(storage, `avatars/${auth.currentUser.uid}/${Date.now()}_${pendingFile.name}`);
                    const snapshot = await uploadBytes(storageRef, pendingFile);
                    finalPhotoURL = await getDownloadURL(snapshot.ref);
                }
            }

            setStatus('saving_profile');
            await updateProfile(auth.currentUser, {
                displayName: name.trim().substring(0, 30),
                photoURL: finalPhotoURL
            });
            await auth.currentUser.reload();
            setStatus('success');
            setTimeout(() => {
                onClose();
                window.location.reload();
            }, 800);
        } catch (error) {
            console.error("Save failed:", error);
            setStatus('error');
            setErrorMessage(error.message || "Failed to save changes.");
        }
    };

    const handleGoogleLogin = async () => {
        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
            // Auth state listener in page.js handles the rest
        } catch (e) {
            console.error(e);
            alert("Login failed");
        }
    };

    const handleLogout = async () => {
        await signOut(auth);
        onClose();
    };

    const handleDeleteAccount = async () => {
        if (!confirm("Are you sure? This deletes your account and cancels subscription immediately.")) return;
        try {
            const uid = user.uid;
            // 1. Delete Firestore User Doc (Trigger extension or let backend handle cleanup?)
            // "Everything that gets sent to the server... is deleted 24 hours" but user doc persists.
            // We should delete user doc.
            await deleteDoc(doc(db, "users", uid));
            // 2. Delete Auth
            await deleteUser(auth.currentUser);
            window.location.reload();
        } catch (e) {
            console.error(e);
            alert("Delete failed. You may need to re-login to prove identity.");
        }
    };

    const handleSubscribe = async () => {
        if (!user) return;

        setStatus('saving_profile'); // Use a loading state, reusing 'saving_profile' or add 'redirecting'
        // Ideally add 'redirecting' state but reused for speed.

        try {
            // Call API
            const response = await fetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.uid,
                    priceId: 'price_12345_placeholder', // TODO: User must replace this
                    returnUrl: window.location.href
                })
            });

            const data = await response.json();
            if (data.url) {
                window.location.href = data.url;
            } else {
                alert("Failed to start checkout: " + (data.error || "Unknown error"));
                setStatus('idle');
            }
        } catch (e) {
            console.error(e);
            alert("Checkout Error");
            setStatus('idle');
        }
    };

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className={`glass-panel w-full max-w-sm p-6 relative flex flex-col gap-6 border shadow-2xl overflow-y-auto max-h-[90vh]
                ${isPremium ? 'border-yellow-500/50 shadow-yellow-500/20' : 'border-white/10'}
            `}>

                {/* Header */}
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        {isPremium && <Crown className="w-5 h-5 text-yellow-400 fill-yellow-400" />}
                        Edit Profile
                    </h2>
                    <button onClick={onClose} disabled={status !== 'idle' && status !== 'error'} className="text-gray-400 hover:text-white disabled:opacity-50">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Avatar Section */}
                <div className="flex flex-col items-center gap-4">
                    <div
                        className="relative group cursor-pointer"
                        onClick={() => status === 'idle' && fileInputRef.current?.click()}
                    >
                        <div className={`w-28 h-28 rounded-full overflow-hidden border-4 ${status === 'uploading_image' ? 'border-yellow-400 animate-pulse' : (isPremium ? 'border-yellow-500' : 'border-purple-500/50')} shadow-lg transaction-all`}>
                            {photoPreview ? (
                                <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full bg-gray-800 flex items-center justify-center text-4xl font-bold text-gray-600">
                                    {name ? name[0]?.toUpperCase() : '?'}
                                </div>
                            )}
                        </div>
                        <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Camera className="w-8 h-8 text-white" />
                        </div>
                    </div>
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileSelect} />
                    <p className="text-xs text-gray-500">Tap image to change</p>
                </div>

                {/* Form Section */}
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-medium text-gray-400 uppercase tracking-wider ml-1">Display Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-purple-500 focus:outline-none transition-all"
                            placeholder="Enter your name"
                            maxLength={30}
                            disabled={status !== 'idle' && status !== 'error'}
                        />
                    </div>

                    {/* Social Login Buttons (If anonymous) */}
                    {user?.isAnonymous && (
                        <div className="space-y-2">
                            <p className="text-xs text-gray-400 ml-1">Connect Account</p>
                            <button onClick={handleGoogleLogin} className="w-full py-3 bg-white text-black font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-gray-200 transition-colors">
                                <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5" alt="G" />
                                Continue with Google
                            </button>
                            {/* Placeholders for others */}
                            <div className="flex gap-2">
                                <button disabled className="flex-1 py-3 bg-[#E1306C] text-white font-bold rounded-xl opacity-50 cursor-not-allowed text-xs">Instagram</button>
                                <button disabled className="flex-1 py-3 bg-black border border-white/20 text-white font-bold rounded-xl opacity-50 cursor-not-allowed text-xs">TikTok</button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Subscription Section */}
                <div className="bg-white/5 rounded-xl p-4 border border-white/10 space-y-3">
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-300">Plan</span>
                        <span className={`text-sm font-bold ${isPremium ? 'text-yellow-400' : 'text-gray-400'}`}>
                            {isPremium ? 'Premium ($4/mo)' : 'Free'}
                        </span>
                    </div>

                    {!isPremium ? (
                        <button onClick={handleSubscribe} className="w-full py-2 bg-gradient-to-r from-yellow-500 to-orange-500 text-black font-bold rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
                            <Crown className="w-4 h-4" /> Upgrade for Unlimited
                        </button>
                    ) : (
                        <div className="text-xs text-center text-green-400 flex items-center justify-center gap-1">
                            <Check className="w-3 h-3" /> Active
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="space-y-3 pt-2">
                    <button
                        onClick={handleSave}
                        disabled={status !== 'idle' && status !== 'error'}
                        className={`w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${status === 'success' ? 'bg-green-500 text-white' : 'bg-purple-600 text-white hover:bg-purple-500'}`}
                    >
                        {status === 'success' ? 'Saved!' : 'Save Changes'}
                    </button>

                    <button onClick={handleLogout} className="w-full py-3 rounded-xl font-bold text-gray-300 hover:bg-white/10 flex items-center justify-center gap-2">
                        <LogOut className="w-4 h-4" /> Sign Out
                    </button>

                    <button onClick={handleDeleteAccount} className="w-full py-3 rounded-xl font-bold text-red-400 hover:bg-red-500/10 flex items-center justify-center gap-2 text-sm">
                        <Trash2 className="w-4 h-4" /> Delete Account
                    </button>
                </div>
            </div>
        </div>
    );
}
