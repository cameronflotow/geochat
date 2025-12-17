import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, where, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export function useChats() {
    const [chats, setChats] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Query active chats (created in last 8 hours)
        // Note: Firestore requires composite index for complex queries.
        // For now we'll fetch all and filter client side if index is missing, 
        // but ideally: where('createdAt', '>', eightHoursAgo).

        // We'll just listen to "chats" and client-filter for simplicity/robustness without index setup delay.
        const q = query(collection(db, "chats"), orderBy("createdAt", "desc"));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const now = Date.now();
            const eightHours = 8 * 60 * 60 * 1000;

            const activeChats = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })).filter(chat => {
                // Filter expired
                const createdAt = chat.createdAt?.toMillis ? chat.createdAt.toMillis() : chat.createdAt;
                return (now - createdAt) < eightHours;
            });

            setChats(activeChats);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching chats:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    return { chats, loading };
}
