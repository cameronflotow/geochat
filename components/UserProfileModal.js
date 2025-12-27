'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Camera, Loader2, Save, LogOut, Trash2, Crown, Check, Mail } from 'lucide-react';
import { updateProfile, linkWithCredential, EmailAuthProvider, signInWithEmailAndPassword, signOut, deleteUser } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL, deleteObject, listAll } from 'firebase/storage';
import { doc, onSnapshot, deleteDoc, updateDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, storage, db } from '@/lib/firebase';

export default function UserProfileModal({ isOpen, onClose, user, initialAuthMode = false }) {
    const [name, setName] = useState('');
    const [photoPreview, setPhotoPreview] = useState(null);
    const [pendingFile, setPendingFile] = useState(null);
    const [userData, setUserData] = useState(null);
    const [status, setStatus] = useState('idle');
    const [errorMessage, setErrorMessage] = useState('');

    // Auth Form State
    const [isAuthMode, setIsAuthMode] = useState(initialAuthMode); // If true, shows login/signup
    const [authType, setAuthType] = useState('signup'); // 'signup' or 'login'
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    // Color Slider State
    const [markerHue, setMarkerHue] = useState(145); // Default Green

    useEffect(() => {
        if (userData?.markerColor?.startsWith('hsl')) {
            const h = userData.markerColor.match(/hsl\((\d+)/)?.[1];
            if (h) setMarkerHue(parseInt(h));
        }
    }, [userData?.markerColor]);

    const handleHueChange = (val) => {
        setMarkerHue(val);
    };

    const saveMarkerColor = async () => {
        if (!user?.uid) return;
        const color = `hsl(${markerHue}, 75%, 50%)`;
        await updateDoc(doc(db, "users", user.uid), { markerColor: color });
    };

    const fileInputRef = useRef(null);

    useEffect(() => {
        if (isOpen && user) {
            setName(user.displayName || '');
            setPhotoPreview(user.photoURL || null);
            setPendingFile(null);
            setStatus('idle');
            setErrorMessage('');
            setIsAuthMode(initialAuthMode); // Reset auth mode based on prop

            // Lazy Cleanup of Old Avatars (>24h)
            const cleanupOldAvatars = async () => {
                if (!user.uid) return;
                const folderRef = ref(storage, `avatars/${user.uid}`);
                try {
                    const res = await listAll(folderRef);
                    const now = Date.now();
                    const ONE_DAY = 24 * 60 * 60 * 1000;

                    res.items.forEach((itemRef) => {
                        // Check if it's the CURRENT photo
                        if (user.photoURL && user.photoURL.includes(itemRef.name)) return;

                        // Check Timestamp in filename (timestamp_name)
                        const match = itemRef.name.match(/^(\d+)_/);
                        if (match) {
                            const timestamp = parseInt(match[1]);
                            if (now - timestamp > ONE_DAY) {
                                console.log("Cleaning up expired avatar:", itemRef.name);
                                deleteObject(itemRef).catch(e => console.error("Cleanup failed", e));
                            }
                        }
                    });
                } catch (e) { console.log("Cleanup check skipped"); }
            };
            cleanupOldAvatars();

            const unsub = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
                setUserData(docSnap.data() || {});
            });
            return () => unsub();
        }
    }, [isOpen, user]);

    if (!isOpen) return null;

    const isPremium = userData?.subscriptionStatus === 'premium';
    const isAnonymous = user?.isAnonymous;

    const compressImage = (file) => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_SIZE = 300; // Max 300px
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_SIZE) {
                            height *= MAX_SIZE / width;
                            width = MAX_SIZE;
                        }
                    } else {
                        if (height > MAX_SIZE) {
                            width *= MAX_SIZE / height;
                            height = MAX_SIZE;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    canvas.toBlob((blob) => {
                        resolve(new File([blob], file.name, { type: 'image/jpeg' }));
                    }, 'image/jpeg', 0.7); // 70% Quality
                };
            };
        });
    };

    const handleFileSelect = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const compressed = await compressImage(file);
        setPhotoPreview(URL.createObjectURL(compressed));
        setPendingFile(compressed);
    };

    // Save Name & Image
    const handleSaveProfile = async () => {
        if (!auth.currentUser) return;
        setStatus('uploading_image');
        setErrorMessage('');
        try {
            console.log("Preserving old avatar history...");
            let finalPhotoURL = user?.photoURL || null;
            if (pendingFile) {
                const storageRef = ref(storage, `avatars/${auth.currentUser.uid}/${Date.now()}_${pendingFile.name}`);
                const snapshot = await uploadBytes(storageRef, pendingFile);
                finalPhotoURL = await getDownloadURL(snapshot.ref);
            }
            setStatus('saving_profile');

            // 1. Delete old avatar - DISABLED to preserve history for chat/shouts
            /*
            if (pendingFile && user?.photoURL && user.photoURL.includes('firebasestorage')) {
                try {
                    const oldRef = ref(storage, user.photoURL);
                    await deleteObject(oldRef).catch(err => console.log("Old avatar delete skipped", err));
                } catch (e) {  }
            }
            */

            // 2. Update Auth Profile
            await updateProfile(auth.currentUser, {
                displayName: name.trim().substring(0, 30),
                photoURL: finalPhotoURL
            });
            await auth.currentUser.reload();

            // 2. Update Firestore & Handle Anonymous TTL
            const userRef = doc(db, "users", user.uid);

            const updates = {
                displayName: name.trim().substring(0, 30),
                photoURL: finalPhotoURL,
                lastUpdated: serverTimestamp()
            };

            if (isAnonymous) {
                // 48 Hours from now
                const now = new Date();
                const expireDate = new Date(now.getTime() + 48 * 60 * 60 * 1000);
                updates.deleteAt = expireDate;
            } else {
                updates.deleteAt = null; // Clear it explicitly
            }

            await setDoc(userRef, updates, { merge: true });

            setStatus('success');
            setTimeout(() => { onClose(); window.location.reload(); }, 800);
        } catch (error) {
            setStatus('error');
            setErrorMessage(error.message);
        }
    };

    // Handle Email/Pass Auth
    const handleAuthAction = async (e) => {
        e?.preventDefault();
        if (!email || !password) return;

        setStatus('saving_profile');
        setErrorMessage('');

        try {
            if (authType === 'signup') {
                if (isAnonymous) {
                    // Try to LINK first to keep data
                    const credential = EmailAuthProvider.credential(email, password);
                    await linkWithCredential(auth.currentUser, credential);

                    // Clear the deletion timer since they are now registered
                    await updateDoc(doc(db, "users", user.uid), { deleteAt: null });
                } else {
                    // Just create new (shouldn't happen often here if already logged in non-anon)
                    alert("You are already signed in.");
                }
            } else {
                // LOGIN (Switches account)
                await signInWithEmailAndPassword(auth, email, password);
            }
            window.location.reload();
        } catch (error) {
            console.error(error);
            if (error.code === 'auth/email-already-in-use') {
                if (authType === 'signup') {
                    setErrorMessage("Email exists. Please Login instead.");
                    setAuthType('login');
                } else {
                    setErrorMessage(error.message);
                }
            } else if (error.code === 'auth/credential-already-in-use') {
                setErrorMessage("This email is already linked to another account.");
            } else {
                setErrorMessage(error.message);
            }
            setStatus('auth_error');
        }
    };

    const handleDeleteAccount = async () => {
        if (!confirm("⚠️ PERMANENTLY DELETE ACCOUNT?\n\nThis will cancel subscriptions and wipe data.")) return;
        try {
            // 1. Delete Avatar File
            if (user?.photoURL && user.photoURL.includes('firebasestorage')) {
                const photoRef = ref(storage, user.photoURL);
                await deleteObject(photoRef).catch(() => { });
            }
            // 2. Delete User Data
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
                body: JSON.stringify({ userId: user.uid, priceId: 'price_1ShebTHoyBRhAkje3Vqen7bG', returnUrl: window.location.href })
            });
            const data = await res.json();
            if (data.url) window.location.href = data.url;
            else { alert(data.error); setStatus('idle'); }
        } catch (e) { setStatus('idle'); }
    };

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className={`glass-panel w-full max-w-sm flex flex-col gap-0 border shadow-2xl max-h-[90vh] rounded-2xl overflow-hidden
                ${isPremium ? 'border-yellow-500/50 shadow-yellow-500/20' : 'border-white/10'}
            `}>
                {/* Header */}
                <div className="flex justify-between items-center p-6 pb-4 bg-black/20">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        {isPremium && <Crown className="w-5 h-5 text-yellow-400 fill-yellow-400" />}
                        Profile
                    </h2>
                    <button onClick={onClose}><X className="text-gray-400 hover:text-white" /></button>
                </div>

                {/* SCROLLABLE CONTENT */}
                <div className="flex-1 overflow-y-auto p-6 pt-2 space-y-6">

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
                    {!isAuthMode && (
                        <div className="space-y-3">
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Display Name</label>
                            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-purple-500 outline-none" placeholder="Your Name" maxLength={30} />

                            <button onClick={handleSaveProfile} disabled={status !== 'idle' && status !== 'error'} className={`w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg ${status === 'success' ? 'bg-green-500 text-white' : 'bg-purple-600 text-white hover:bg-purple-500'}`}>
                                {status === 'saving_profile' || status === 'uploading_image' ? <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</> : status === 'success' ? <><Check className="w-5 h-5" /> Saved!</> : <><Save className="w-5 h-5" /> Save Changes</>}
                            </button>
                            {errorMessage && status === 'error' && <p className="text-red-400 text-xs text-center">{errorMessage}</p>}
                        </div>
                    )}

                    <div className="h-px bg-white/10" />

                    {/* 3. Authentication (Email/Pass) */}
                    {isAnonymous && !isAuthMode ? (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 font-medium">COMPLETE YOUR ACCOUNT</span>
                            </div>
                            <p className="text-xs text-gray-400">Save your data and access it anywhere.</p>

                            <button
                                onClick={() => setIsAuthMode(true)}
                                className="w-full py-3 bg-white text-black font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-gray-200 transition-colors"
                            >
                                <Mail className="w-4 h-4" /> Sign Up / Login with Email
                            </button>
                        </div>
                    ) : isAuthMode ? (
                        <form onSubmit={handleAuthAction} className="space-y-4 bg-white/5 p-4 rounded-xl border border-white/10 animate-in fade-in slide-in-from-top-4">
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="text-white font-bold">{authType === 'signup' ? 'Create Account' : 'Welcome Back'}</h3>
                                <button type="button" onClick={() => setIsAuthMode(false)} className="text-gray-400 hover:text-white text-xs">Cancel</button>
                            </div>

                            <div className="space-y-3">
                                <input
                                    type="email"
                                    placeholder="Email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none"
                                    required
                                />
                                <div className="relative">
                                    <input
                                        type="password"
                                        placeholder="Password"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none"
                                        required
                                        minLength={6}
                                    />
                                </div>
                            </div>

                            {errorMessage && status === 'auth_error' && <p className="text-red-400 text-xs">{errorMessage}</p>}

                            <button
                                type="submit"
                                disabled={status === 'saving_profile'}
                                className="w-full py-2.5 bg-purple-600 rounded-lg text-white font-bold hover:bg-purple-500 transition-colors flex items-center justify-center gap-2"
                            >
                                {status === 'saving_profile' ? <Loader2 className="w-4 h-4 animate-spin" /> : (authType === 'signup' ? 'Sign Up & Save' : 'Login')}
                            </button>

                            <div className="flex justify-center text-xs text-gray-400 gap-1">
                                {authType === 'signup' ? 'Already have an account?' : 'Need an account?'}
                                <button
                                    type="button"
                                    onClick={() => { setAuthType(authType === 'signup' ? 'login' : 'signup'); setErrorMessage(''); }}
                                    className="text-purple-400 hover:text-white font-bold"
                                >
                                    {authType === 'signup' ? 'Login' : 'Sign Up'}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <>
                            {/* INVENTORY / COLLECTIONS */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">My Collection</span>
                                    <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded-full text-gray-400">
                                        {userData?.inventory ? Object.values(userData.inventory).reduce((a, b) => a + b, 0) : 0} Items
                                    </span>
                                </div>

                                {!userData?.inventory || Object.keys(userData.inventory).length === 0 ? (
                                    <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-center">
                                        <div className="text-2xl mb-1 grayscale opacity-50">🥚</div>
                                        <p className="text-xs text-gray-500">No emojis collected yet.</p>
                                        <p className="text-[10px] text-gray-600 mt-1">Explore the map to find them!</p>
                                    </div>
                                ) : (
                                    <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                                        <div className="grid grid-cols-5 gap-2">
                                            {/* Default Option */}
                                            <div
                                                onClick={() => updateDoc(doc(db, "users", user.uid), { selectedEmoji: null })}
                                                className={`aspect-square flex flex-col items-center justify-center rounded-lg cursor-pointer transition-all border-2 ${!userData?.selectedEmoji
                                                    ? 'bg-white/10 border-white shadow-[0_0_10px_rgba(255,255,255,0.2)]'
                                                    : 'bg-white/5 border-white/5 hover:bg-white/10'
                                                    }`}
                                                title="Default Style"
                                            >
                                                <div className="w-6 h-6 rounded bg-gray-600" />
                                            </div>

                                            {(() => {
                                                const inventory = userData.inventory || {};
                                                const BANNED_ITEMS = ['Single', 'Taken', 'Complicated', 'Adventurous', 'Vibing', 'Happy', 'Sad', 'BadBitch', 'Wants a Drink', 'Flotow', 'Looking for Group', 'Study Partner'];
                                                const entries = Object.entries(inventory).filter(([k]) => !BANNED_ITEMS.includes(k));

                                                // DEFAULTS (Always available)
                                                const DEFAULTS = ['Wants 🍸', 'Wants 🎲', 'Wants 🎵', 'Wants 💃', 'Wants 🤫', 'Wants 🔥'];
                                                const defaultEntries = DEFAULTS.filter(d => !inventory[d]).map(d => [d, 1]);

                                                // Split into Text vs Emoji
                                                const isTextStr = (str) => /[a-zA-Z]/.test(str);
                                                const textItems = [...entries, ...defaultEntries].filter(([k]) => isTextStr(k)).sort((a, b) => a[0].localeCompare(b[0]));
                                                const emojiItems = entries.filter(([k]) => !isTextStr(k)).sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0])); // Stable sort

                                                return [...textItems, ...emojiItems].map(([emoji, count]) => {
                                                    const isUltraRare = ['🍑', '🍆', '👽', '🦄', '🐲', '💎'].includes(emoji);
                                                    const isSelected = userData?.selectedEmoji === emoji;
                                                    const isText = isTextStr(emoji);

                                                    return (
                                                        <div
                                                            key={emoji}
                                                            onClick={() => updateDoc(doc(db, "users", user.uid), { selectedEmoji: emoji })}
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
                                )}
                            </div>

                            <div className="h-px bg-white/10" />

                            {/* MARKER COLOR SELECTOR */}
                            <div className="space-y-3">
                                <div className="flex justify-between items-center px-1">
                                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Map Marker Color</span>
                                    <span className="text-xs font-bold" style={{ color: `hsl(${markerHue}, 75%, 50%)` }}>Preview</span>
                                </div>

                                <div className="bg-white/5 rounded-xl p-4 border border-white/5 flex items-center gap-4">
                                    {/* Preview Dot */}
                                    <div
                                        className="w-10 h-10 rounded-full border-4 border-white shadow-lg shrink-0 transition-colors duration-200"
                                        style={{ backgroundColor: `hsl(${markerHue}, 75%, 50%)` }}
                                    />

                                    {/* Slider */}
                                    <div className="flex-1 relative h-6 flex items-center">
                                        <div className="absolute inset-0 rounded-full opacity-80" style={{ background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)' }} />
                                        <input
                                            type="range"
                                            min="0"
                                            max="360"
                                            value={markerHue}
                                            onChange={(e) => handleHueChange(e.target.value)}
                                            onMouseUp={saveMarkerColor}
                                            onTouchEnd={saveMarkerColor}
                                            className="w-full relative z-10 appearance-none bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-gray-400 [&::-webkit-slider-thumb]:shadow-lg cursor-pointer"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="h-px bg-white/10" />

                            {/* 4. Upgrade Button (Only if NOT anonymous) */}
                            {!isPremium ? (
                                <div className="cursor-not-allowed group relative overflow-hidden rounded-xl bg-white/5 border border-white/5 p-4 opacity-70">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-gray-500/20 rounded-lg text-gray-500"><Crown className="w-5 h-5" /></div>
                                            <div><h3 className="font-bold text-white text-sm">Premium Coming Soon</h3><p className="text-xs text-gray-400">Unlimited features ahead</p></div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center gap-2">
                                    <Check className="w-4 h-4 text-green-400" /> <span className="text-green-400 font-bold text-sm">Premium Active</span>
                                </div>
                            )}

                            <div className="h-4" /> {/* Spacer */}
                        </>
                    )}
                </div> {/* END SCROLLABLE */}

                {/* FIXED FOOTER */}
                {!isAuthMode && !isAnonymous && (
                    <div className="p-4 bg-black/20 border-t border-white/5 flex justify-between items-center bg-white/5">
                        <button onClick={() => signOut(auth).then(onClose)} className="text-xs font-bold text-gray-500 hover:text-white flex items-center gap-2 px-2 py-1"><LogOut className="w-3.5 h-3.5" /> Sign Out</button>
                        <button onClick={handleDeleteAccount} className="text-xs font-bold text-red-900/50 hover:text-red-500 flex items-center gap-2 px-2 py-1"><Trash2 className="w-3.5 h-3.5" /> Delete Account</button>
                    </div>
                )}
            </div>
        </div>
    );
}
