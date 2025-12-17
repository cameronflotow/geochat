'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Camera, Loader2, Save, AlertTriangle } from 'lucide-react';
import { updateProfile } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore'; // Added fs imports
import { auth, storage, db } from '@/lib/firebase';

export default function UserProfileModal({ isOpen, onClose, user }) {
    const [name, setName] = useState('');
    const [photoPreview, setPhotoPreview] = useState(null);
    const [pendingFile, setPendingFile] = useState(null);

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
        }
    }, [isOpen, user]);

    if (!isOpen) return null;

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Basic Validation
        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            alert("File is too large (Max 5MB)");
            return;
        }

        // Create local preview
        const objectUrl = URL.createObjectURL(file);
        setPhotoPreview(objectUrl);
        setPendingFile(file);
        setStatus('idle'); // Reset any previous error
    };

    const handleSave = async () => {
        if (!auth.currentUser) return;

        setStatus('uploading_image');
        setErrorMessage('');

        try {
            let finalPhotoURL = user?.photoURL || null;

            // 1. Upload Image
            if (pendingFile) {
                // Ensure bucket config exists
                const updateBucket = storage.app.options.storageBucket;
                if (!updateBucket || updateBucket.includes("mock_")) {
                    throw new Error("Missing Storage Bucket Configuration. Check your .env file.");
                }

                const storageRef = ref(storage, `avatars/${auth.currentUser.uid}/${Date.now()}_${pendingFile.name}`);
                
                try {
                    // Standard upload without artificial timeout
                    const snapshot = await uploadBytes(storageRef, pendingFile);
                    finalPhotoURL = await getDownloadURL(snapshot.ref);
                } catch (uploadError) {
                    console.error("Upload failed:", uploadError);
                    if (uploadError.code === 'storage/unauthorized') {
                        throw new Error("Permission denied: Check Firebase Storage Rules.");
                    } else if (uploadError.message.includes('network')) {
                         // This is often CORS locally
                         console.warn("Network error during upload - likely CORS or connectivity.");
                         throw new Error("Network error: Upload blocked. (If locally, check CORS).");
                    }
                    throw uploadError;
                }
            }

            // 2. Update Auth Profile
            setStatus('saving_profile');
            
            await updateProfile(auth.currentUser, {
                displayName: name.trim().substring(0, 30),
                photoURL: finalPhotoURL
            });

            // 3. Force reload of local auth state to ensure UI updates immediately
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

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className="glass-panel w-full max-w-sm p-6 relative flex flex-col gap-6 border border-white/10 shadow-2xl">

                {/* Header */}
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white">Edit Profile</h2>
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
                        <div className={`w-28 h-28 rounded-full overflow-hidden border-4 ${status === 'uploading_image' ? 'border-yellow-400 animate-pulse' : 'border-purple-500/50'} shadow-lg transaction-all`}>
                            {photoPreview ? (
                                <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full bg-gray-800 flex items-center justify-center text-4xl font-bold text-gray-600">
                                    {name ? name[0]?.toUpperCase() : '?'}
                                </div>
                            )}
                        </div>

                        {/* Overlay Icon */}
                        <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Camera className="w-8 h-8 text-white" />
                        </div>
                    </div>

                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/png, image/jpeg, image/webp"
                        onChange={handleFileSelect}
                    />

                    <p className="text-xs text-gray-500">Tap image to change</p>
                </div>

                {/* Form Section */}
                <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-400 uppercase tracking-wider ml-1">Display Name</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all font-medium"
                        placeholder="Enter your name"
                        maxLength={30}
                        disabled={status !== 'idle' && status !== 'error'}
                    />
                </div>

                {/* Error Banner */}
                {status === 'error' && (
                    <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 flex items-start gap-2 text-red-200 text-sm">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{errorMessage}</span>
                    </div>
                )}

                {/* Action Button */}
                <button
                    onClick={handleSave}
                    disabled={status === 'uploading_image' || status === 'saving_profile' || status === 'success'}
                    className={`
                        w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all
                        ${status === 'success' ? 'bg-green-500 text-white' : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:opacity-90'}
                        disabled:opacity-70 disabled:cursor-not-allowed
                    `}
                >
                    {status === 'idle' && <><Save className="w-4 h-4" /> Save Changes</>}
                    {status === 'error' && <><Save className="w-4 h-4" /> Retry Save</>}
                    {status === 'uploading_image' && <><Loader2 className="w-4 h-4 animate-spin" /> Uploading Image...</>}
                    {status === 'saving_profile' && <><Loader2 className="w-4 h-4 animate-spin" /> Updating Profile...</>}
                    {status === 'success' && <>Saved! Refreshing...</>}
                </button>
            </div>
        </div>
    );
}
