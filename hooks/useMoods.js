import { useState, useEffect } from 'react';
import {
    collection, query, onSnapshot, orderBy,
    startAt, endAt, doc, setDoc, deleteDoc, updateDoc, serverTimestamp
} from 'firebase/firestore';
import { geohashQueryBounds, distanceBetween, geohashForLocation } from 'geofire-common';
import { db } from '@/lib/firebase';

const MOOD_RADIUS_M = 5000; // Load moods within 5km

export function useMoods(userLocation, user) {
    // Map of query index -> results array
    const [results, setResults] = useState({});

    // Flatten results into unique list
    const moods = Object.values(results).flat().reduce((acc, current) => {
        const x = acc.find(item => item.id === current.id);
        if (!x) {
            return acc.concat([current]);
        } else {
            return acc;
        }
    }, []);

    // LOAD MOODS (Geo Query)
    useEffect(() => {
        if (!userLocation) return;

        const center = [userLocation.lat, userLocation.lng];
        const bounds = geohashQueryBounds(center, MOOD_RADIUS_M);
        const moodsRef = collection(db, 'moods');
        const unsubscribes = [];

        // Geofire queries
        bounds.forEach((b, i) => {
            const q = query(
                moodsRef,
                orderBy('geohash'),
                startAt(b[0]),
                endAt(b[1])
            );

            unsubscribes.push(onSnapshot(q, (snapshot) => {
                const now = Date.now();
                const newMoods = [];
                snapshot.forEach(doc => {
                    const data = doc.data();

                    // Client-side filtering
                    if (data.expiresAt?.toMillis && now > data.expiresAt.toMillis()) {
                        return; // Expired
                    }

                    // Distance filter
                    const distanceInKm = distanceBetween([data.lat, data.lng], center);
                    const distanceInM = distanceInKm * 1000;
                    if (distanceInM <= MOOD_RADIUS_M) {
                        newMoods.push({ id: doc.id, ...data });
                    }
                });

                // Update results for this specific bound index
                setResults(prev => ({
                    ...prev,
                    [i]: newMoods
                }));
            }));
        });

        return () => unsubscribes.forEach(unsub => unsub());

    }, [userLocation?.lat, userLocation?.lng]); // Re-run if user moves significantly? Or just once? Usually on significant move.


    // DROP MOOD
    const dropMood = async (emoji, user) => {
        if (!user || !userLocation) return;

        const hash = geohashForLocation([userLocation.lat, userLocation.lng]);
        const moodRef = doc(db, 'moods', user.uid);
        const userRef = doc(db, 'users', user.uid);

        try {
            // 1. Drop on Map
            await setDoc(moodRef, {
                uid: user.uid,
                creatorName: user.displayName || 'Anonymous',
                creatorPhoto: user.photoURL,
                emoji: emoji,
                lat: userLocation.lat,
                lng: userLocation.lng,
                geohash: hash,
                createdAt: serverTimestamp(),
                expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 Hours
            });

            // 2. Sync to Profile (For Chat/Shouts)
            await updateDoc(userRef, {
                currentMood: emoji
            });
        } catch (e) {
            console.error("Error dropping mood:", e);
        }
    };

    // CLEAR MOOD
    const clearMood = async (user) => {
        if (!user) return;
        try {
            await deleteDoc(doc(db, 'moods', user.uid));
            await updateDoc(doc(db, 'users', user.uid), {
                currentMood: null
            });
        } catch (e) {
            console.error("Error clearing mood:", e);
        }
    };

    // SET MOOD ONLY (No Map Marker)
    const setMoodOnly = async (emoji, user) => {
        if (!user) return;
        try {
            await updateDoc(doc(db, 'users', user.uid), {
                currentMood: emoji
            });
        } catch (e) {
            console.error("Error setting mood only:", e);
        }
    };

    return { moods, dropMood, clearMood, setMoodOnly };
}
