'use client';

import { useState } from 'react';
import { X, MapPin } from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';

// Helper to calculate distance in meters
function getDistanceFromLatLonInM(lat1, lon1, lat2, lon2) {
    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2 - lat1);  // deg2rad below
    var dLon = deg2rad(lon2 - lon1);
    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
        ;
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c; // Distance in km
    return d * 1000; // in meters
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

export default function CreateChatModal({ isOpen, onClose, userLocation, existingChats, user }) {
    const [name, setName] = useState('');
    const [creating, setCreating] = useState(false);
    const CHAT_RADIUS = 100; // meters. User didn't specify radius but implied "geofence". 100m is decent.
    const MIN_DISTANCE_BETWEEN_CHATS = 150; // Prevent overlapping drop zones

    if (!isOpen) return null;

    const handleCreate = async () => {
        if (!name.trim()) return;
        if (!userLocation) {
            alert("Location not found. Cannot drop chat.");
            return;
        }

        // Check proximity
        const tooClose = existingChats.some(chat => {
            const dist = getDistanceFromLatLonInM(userLocation.lat, userLocation.lng, chat.lat, chat.lng);
            return dist < MIN_DISTANCE_BETWEEN_CHATS;
        });

        if (tooClose) {
            alert("Too close to another chat! Move further away.");
            return;
        }

        try {
            console.log("Attempting to create chat...");
            setCreating(true);
            const chatData = {
                name: name,
                lat: userLocation.lat,
                lng: userLocation.lng,
                creatorId: user?.uid || auth.currentUser?.uid || 'anonymous',
                creatorName: user?.displayName || auth.currentUser?.displayName || 'Anonymous',
                createdAt: serverTimestamp(),
                radius: CHAT_RADIUS
            };
            console.log("Chat Data:", chatData);

            // Race against a timeout
            const createPromise = addDoc(collection(db, "chats"), chatData);
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Request timed out - Check your connection")), 10000)
            );

            await Promise.race([createPromise, timeoutPromise]);

            console.log("Chat created successfully!");
            const docRef = await createPromise; // Await again to get the ID safely (it's resolved)

            onClose();
            setName('');

            // Auto navigate to the new chat
            if (docRef.id) {
                window.location.href = `/chat/${docRef.id}`;
            }
        } catch (e) {
            console.error("Error creating chat:", e);
            console.error("Error Code:", e.code);
            console.error("Error Message:", e.message);
            alert(`Failed: ${e.message}`);
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="glass-panel w-full max-w-md p-6 relative animate-in fade-in zoom-in duration-200">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-white/70 hover:text-white"
                >
                    <X className="w-6 h-6" />
                </button>

                <h2 className="text-2xl font-bold mb-2 text-center text-white">
                    Drop a Chat <span className="text-xs text-purple-400 align-top">(v1.2)</span>
                </h2>
                <p className="text-center text-gray-400 text-sm mb-6">
                    Create a chat zone at your current location.
                </p>

                <div className="space-y-4">
                    <div className="bg-white/5 rounded-xl p-4 flex items-center gap-3 border border-white/10">
                        <MapPin className="w-5 h-5 text-purple-400" />
                        <div className="text-sm">
                            <div className="text-gray-400">Location</div>
                            <div className="text-white font-mono text-xs truncate">
                                {userLocation ? `${userLocation.lat.toFixed(6)}, ${userLocation.lng.toFixed(6)}` : 'Locating...'}
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="text-sm text-gray-400 pl-2">Chat Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Chill Spot, Event Info..."
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
                            autoFocus
                        />
                    </div>

                    <button
                        onClick={handleCreate}
                        disabled={creating || !userLocation || !user || !user.uid}
                        className="btn-primary w-full py-3 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {creating ? 'Dropping...' : (!user ? 'Verifying Identity...' : 'Drop Chat Here')}
                    </button>
                </div>
            </div>
        </div>
    );
}
