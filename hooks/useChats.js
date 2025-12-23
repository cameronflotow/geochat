import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, startAt, endAt } from 'firebase/firestore';
import { geohashQueryBounds, distanceBetween } from 'geofire-common';
import { db } from '@/lib/firebase';

const QUERY_RADIUS_M = 50 * 1000; // 50km radius for fetching chats

export function useChats(userLocation) {
    const [chats, setChats] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!userLocation) {
            setChats([]);
            setLoading(false);
            return;
        }

        const center = [userLocation.lat, userLocation.lng];
        const bounds = geohashQueryBounds(center, QUERY_RADIUS_M);

        const listeners = [];
        const resultsByBound = new Map(); // Map<index, docs[]>

        // Helper to merge and update state
        const updateState = () => {
            const allDocs = [];
            resultsByBound.forEach(docs => allDocs.push(...docs));

            // Dedupe and filter
            const uniqueMap = new Map();
            allDocs.forEach(doc => {
                const data = doc.data();

                // Client-side filtering check
                // (Optional: Re-check distance if needed for strictness, but geohash is usually close enough for "Lite")
                // Let's rely on Geofire bounds mostly, but maybe strict filter if we want circular exactness.
                const distanceInKm = distanceBetween([data.lat, data.lng], center);
                const distanceInM = distanceInKm * 1000;

                // Check TTL (24 hours)
                const now = Date.now();
                const createdAt = data.createdAt?.toMillis ? data.createdAt.toMillis() : (data.createdAt || 0);
                const isExpired = (now - createdAt) > (24 * 60 * 60 * 1000);

                if (!uniqueMap.has(doc.id) && distanceInM <= QUERY_RADIUS_M && !isExpired) {
                    uniqueMap.set(doc.id, { id: doc.id, ...data });
                }
            });

            setChats(Array.from(uniqueMap.values()));
            setLoading(false);
        };

        // For each geohash bound, we need a separate listener
        bounds.forEach((b, index) => {
            const q = query(
                collection(db, "chats"),
                orderBy("geohash"),
                startAt(b[0]),
                endAt(b[1])
            );

            const unsubscribe = onSnapshot(q, (snapshot) => {
                resultsByBound.set(index, snapshot.docs);
                updateState();
            }, (error) => {
                console.error(`Error fetching chats for bound ${index}:`, error);
                // Don't kill the whole app, just log
            });
            listeners.push(unsubscribe);
        });

        return () => {
            listeners.forEach(unsub => unsub());
        };
    }, [userLocation?.lat, userLocation?.lng]);
    // Dependency on lat/lng ensures we re-subscribe when moving significantly.

    return { chats, loading };
}

// Better Implementation for handling multiple listeners result merging:
/*
  We need to know which docs belong to which bound query to correctly handle "removals".
  But since this is a "Lite" refactor, let's keep it simple: 
  If the user moves, we reset.
  If a chat is added, it appears.
  If a chat is deleted... effectively handling deletions with multiple merged snapshots is tricky 
  without a robust reducer. Use a simpler approach: 
  
  Just fetch fully on move (loading...) or accept that deletions might lag until refresh 
  unless we structure it carefully.
  
  Let's use a ref to store the state of each bound index.
*/

