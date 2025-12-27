import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, startAt, endAt, limit } from 'firebase/firestore';
import { geohashQueryBounds, distanceBetween } from 'geofire-common';
import { db } from '@/lib/firebase';

const SHOUT_RADIUS_M = 1 * 1609.34; // 1 mile in meters (~1609m)

export function useShouts(userLocation, radiusMiles = 10) {
    const [shouts, setShouts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!userLocation) {
            setShouts([]);
            setLoading(false);
            return;
        }

        const radiusNum = Number(radiusMiles) || 10;
        const radiusInM = radiusNum * 1609.34;
        const center = [userLocation.lat, userLocation.lng];
        const bounds = geohashQueryBounds(center, radiusInM);

        setShouts([]); // CLEAR OLD DATA IMMEDIATELY
        setLoading(true);

        const listeners = [];
        const resultsByBound = new Map();

        const updateState = () => {
            const allDocs = [];
            resultsByBound.forEach(docs => allDocs.push(...docs));

            console.log(`[useShouts] Update State. Radius: ${radiusInM}m. Total docs from firestore: ${allDocs.length}`);
            const uniqueMap = new Map();
            allDocs.forEach(doc => {
                const data = doc.data();
                if (!data.lat || !data.lng) return;

                const distanceInM = distanceBetween([data.lat, data.lng], center) * 1000;

                // TTL Check (24h)
                const now = Date.now();
                // Handle pending serverTimestamp (null) by assuming it's new (Date.now())
                const createdAt = data.createdAt?.toMillis ? data.createdAt.toMillis() : (data.createdAt instanceof Date ? data.createdAt.getTime() : (data.createdAt || Date.now()));
                const isExpired = (now - createdAt) > (24 * 60 * 60 * 1000);

                const isWithin = distanceInM <= radiusInM;
                if (!isWithin) {
                    console.log(`[useShouts] Filtered out ${doc.id}. Dist: ${Math.round(distanceInM)}m > Radius: ${Math.round(radiusInM)}m`);
                }

                if (!uniqueMap.has(doc.id) && isWithin && !isExpired) {
                    uniqueMap.set(doc.id, { id: doc.id, ...data });
                }
            });

            // Sort by time desc
            const sorted = Array.from(uniqueMap.values()).sort((a, b) => {
                const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
                const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
                return tB - tA;
            });

            console.log(`[useShouts] Final Filtered Count: ${sorted.length}. userLocation: ${JSON.stringify(center)}, radius: ${radiusMiles}mi (${Math.round(radiusInM)}m)`);
            setShouts(sorted);
            setLoading(false);
        };

        bounds.forEach((b, index) => {
            const q = query(
                collection(db, "shouts"),
                orderBy("geohash"),
                startAt(b[0]),
                endAt(b[1])
                // limit(50)? Shouts feed might need pagination but start with raw stream
            );

            const unsubscribe = onSnapshot(q, (snapshot) => {
                resultsByBound.set(index, snapshot.docs);
                updateState();
            }, (error) => {
                console.error(`Error fetching shouts bound ${index}:`, error);
            });
            listeners.push(unsubscribe);
        });

        return () => {
            listeners.forEach(unsub => unsub());
        };
    }, [userLocation?.lat, userLocation?.lng, radiusMiles]);

    return { shouts, loading };
}
