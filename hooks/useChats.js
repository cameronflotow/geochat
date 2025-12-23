import { useState, useEffect, useRef } from 'react';
import { collection, query, onSnapshot, orderBy, startAt, endAt } from 'firebase/firestore';
import { geohashQueryBounds, distanceBetween } from 'geofire-common';
import { db } from '@/lib/firebase';

const QUERY_RADIUS_M = 50 * 1000; // 50km radius for fetching chats
const REFETCH_DISTANCE_THRESHOLD_M = 500; // Only re-fetch if moved 500m

export function useChats(userLocation) {
    const [chats, setChats] = useState([]);
    const [loading, setLoading] = useState(true);

    // Throttling State: "Where did we last query from?"
    const [queryCenter, setQueryCenter] = useState(null);

    // Effect 1: Smart Throttling
    // Decides IF we should update the queryCenter
    useEffect(() => {
        if (!userLocation) return;

        // Initial Load
        if (!queryCenter) {
            setQueryCenter({ lat: userLocation.lat, lng: userLocation.lng });
            return;
        }

        // Calculate distance moved
        const distKm = distanceBetween(
            [userLocation.lat, userLocation.lng],
            [queryCenter.lat, queryCenter.lng]
        );
        const distM = distKm * 1000;

        // If moved significantly, pivot the query center
        if (distM > REFETCH_DISTANCE_THRESHOLD_M) {
            console.log(`User moved ${Math.round(distM)}m. Refetching chats...`);
            setQueryCenter({ lat: userLocation.lat, lng: userLocation.lng });
        }
    }, [userLocation?.lat, userLocation?.lng]);

    // Effect 2: The Expensive Listener
    // Depends on 'queryCenter', NOT 'userLocation'
    useEffect(() => {
        if (!queryCenter) {
            setChats([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        const center = [queryCenter.lat, queryCenter.lng];
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

                // Check distance from the LIVE user location (if available) or Query Center?
                // Using Query Center ensures consistency with the query bounds.
                // But for UI "nearby" check, we might want userLocation.
                // However, for fetching, we use center.

                const distanceInKm = distanceBetween([data.lat, data.lng], center);
                const distanceInM = distanceInKm * 1000;

                // Check TTL (24 hours) - Client side safety
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
            });
            listeners.push(unsubscribe);
        });

        return () => {
            listeners.forEach(unsub => unsub());
        };
    }, [queryCenter?.lat, queryCenter?.lng]); // Only re-run if queryCenter moves

    return { chats, loading };
}

