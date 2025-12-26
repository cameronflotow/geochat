import { useState, useEffect, useRef } from 'react';
import { doc, increment, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// CONFIG
const SPAWN_MIN_DIST = 80; // Spawn CLOSER (80m)
const SPAWN_MAX_DIST = 200; // Max 200m
const COLLECT_DISTANCE_M = 75;
const MIN_COOLDOWN_MS = 60 * 1000; // 1 Minute
const MAX_COOLDOWN_ADD_MS = 60 * 1000; // + up to 1 Minute (Total 1-2m)
const DESPAWN_TIMEOUT = 15 * 60 * 1000; // Item lives for 15 mins then leaves

// POOLS
// POOLS
const COMMON = [
    // Faces
    '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙',
    '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬',
    '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳',
    // Hands
    '👋', '🤚', '🖐', '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '👍', '👎', '✊',
    // Animals
    '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤',
    // Nature
    '🌵', '🎄', '🌲', '🌳', '🌴', '🌱', '🌿', '☘️', '🍀', '🎍', '🎋', '🍃', '🍂', '🍁', '🍄', '🐚', '🌾', '💐', '🌷',
    // Food
    '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🥑', '🍆',
    '🥦', '🥬', '🥒', '🌶', '🌽', '🥕', '🥔', '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🥞', '🥓', '🥩',
    '🍗', '🍖', '🌭', '🍔', '🍟', '🍕', '🥪', '🥙', '🌮', '🌯', '🥗', '🥘', '🥫', '🍝', '🍜', '🍲', '🍛', '🍣',
    // Objects
    '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🎱', '🏓', '🏸', '🥅', '🏒', '🏑', '🏏', '⛳', '🏹', '🎣', '🥊',
    '🥋', '🎽', '🛹', '🛷', '⛸', '🥌', '🎿', '⛷', '🏂', '🏋️‍♀️', '🤼‍♀️', '🤸‍♀️', '⛹️‍♀️', '🤺', '🤾‍♀️', '🏌️‍♀️', '🏇', '🧘‍♀️'
];

const RARE = [
    // Special Faces
    '👿', '👹', '👺', '💀', '☠️', '👻', '👽', '👾', '🤖', '💩', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾',
    // Rare Objects
    '💎', '💍', '💄', '👑', '👒', '🎩', '🎓', '⛑', '🎒', '👜', '👛', '👜', '💼', '👓', '🕶', '🥽', '🧣', '🧤',
    // Vehicles
    '🚗', '🚕', '🚙', '🚌', '🚎', '🏎', '🚓', '🚑', '🚒', '🚐', '🚚', '🚛', '🚜', '🛴', '🚲', '🛵', '🏍', '🛺',
    // Instruments
    '🎷', '🎸', '🎹', '🎺', '🎻', '🥁', '🎤', '🎧', '🎼',
    // Hearts & Lips
    '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💋'
];

const ULTRA_RARE = [
    // Mystical
    '🐉', '🐲', '🦄', '🐆', '🐅', '🐊', '🐋', '🦈', '🦅', '🦅', '🦋', '🐞', '🕷', '🕸', '🦂', '🦟', '🦠',
    // Space
    '🌍', '🌎', '🌏', '🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘', '🌙', '🌚', '🌛', '🌜', '☀️', '🌝', '🌞',
    '⭐', '🌟', '🌠', '☁️', '⛅', '⛈', '🌤', '🌥', '🌦', '🌧', '🌨', '🌩', '🌪', '🌫', '🌈', '⚡', '❄️', '🔥',
    // Medals/Trophies
    '🥇', '🥈', '🥉', '🏅', '🎖', '🏆',
    // Custom Text Items (Refined)
    'BadBitch', 'Wants a Drink',
    'Single', 'Taken', 'Vibing', 'Happy', 'Sad', 'Adventurous', 'Wants 🍺', 'Wants 💬',
    'Flotow' // The Classic
];

const getRandomEmoji = () => {
    const rand = Math.random();
    // 15% Chance of Ultra Rare (which includes text items now)
    if (rand < 0.15) return { char: ULTRA_RARE[Math.floor(Math.random() * ULTRA_RARE.length)], rarity: 'ultra' };
    // 30% Chance of Rare
    if (rand < 0.45) return { char: RARE[Math.floor(Math.random() * RARE.length)], rarity: 'rare' };
    // 55% Common
    return { char: COMMON[Math.floor(Math.random() * COMMON.length)], rarity: 'common' };
};

// Helper for distance (Simple Haversine)
function dist(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
    var R = 6371; // km
    var dLat = (lat2 - lat1) * (Math.PI / 180);
    var dLon = (lon2 - lon1) * (Math.PI / 180);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c * 1000;
}

// Helper: Point at distance and bearing
function getPointAtDist(lat, lng, d, angle) {
    const dLat = (d * Math.cos(angle)) / 111320;
    const dLng = (d * Math.sin(angle)) / (40075000 * Math.cos(lat * Math.PI / 180) / 360);
    return { lat: lat + dLat, lng: lng + dLng };
}

export function useEmojiSystem(userLocation, user, chats = []) {
    const [nearbyItems, setNearbyItems] = useState([]);
    const [canCollectItem, setCanCollectItem] = useState(null);
    const locationRef = useRef(userLocation);
    const chatsRef = useRef(chats); // Ref for chats to avoid interval staleness

    // PERSISTENCE KEY
    const STORAGE_KEY = 'geochat_npc_state_v2';

    useEffect(() => {
        locationRef.current = userLocation;
        chatsRef.current = chats;
    }, [userLocation, chats]);

    // Safety Check Helper
    const isSafeLocation = (lat, lng) => {
        const currentChats = chatsRef.current || [];
        if (currentChats.length === 0) return true;
        return !currentChats.some(chat => {
            const d = dist(lat, lng, chat.lat, chat.lng);
            // Don't spawn/move inside a chat + 10m buffer
            return d < (chat.radius + 10);
        });
    };

    // 1. INIT & SPAWN LOOP
    useEffect(() => {
        if (!userLocation) return;

        // Restore from Storage on Mount
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // If we have an active item that hasn't expired, restore it
                if (parsed.activeItem && Date.now() < parsed.activeItem.despawnTime) {
                    setNearbyItems([parsed.activeItem]);
                }
            } catch (e) {
                console.error("Failed to parse NPC state", e);
            }
        }

        const interval = setInterval(() => {
            const loc = locationRef.current;
            if (!loc) return;

            setNearbyItems(prev => {
                const now = Date.now();
                let next = [...prev];

                // 1. Storage Check
                const currentStored = localStorage.getItem(STORAGE_KEY) ? JSON.parse(localStorage.getItem(STORAGE_KEY)) : {};

                // 2. Check Expiration of existing item
                if (next.length > 0) {
                    const item = next[0];
                    if (now > item.despawnTime) {
                        // Despawn & Set Cooldown (30s-1m)
                        next = [];
                        const nextSpawn = now + MIN_COOLDOWN_MS + Math.random() * MAX_COOLDOWN_ADD_MS;
                        localStorage.setItem(STORAGE_KEY, JSON.stringify({ nextSpawnTime: nextSpawn }));
                    } else {
                        // Persist current position (for refresh safety)
                        localStorage.setItem(STORAGE_KEY, JSON.stringify({ activeItem: item }));
                    }
                    return next;
                }

                // 3. If Empty, Check Cooldown
                if (currentStored.nextSpawnTime && now < currentStored.nextSpawnTime) {
                    return []; // Cooling down...
                }

                // 4. Spawn allowed?
                if (next.length === 0) {
                    let attempts = 0;
                    let newItem = null;

                    // Try 5 times to find safe spot
                    while (attempts < 5 && !newItem) {
                        const rDist = SPAWN_MIN_DIST + Math.random() * (SPAWN_MAX_DIST - SPAWN_MIN_DIST);
                        const rAngle = Math.random() * 2 * Math.PI;
                        const pos = getPointAtDist(loc.lat, loc.lng, rDist, rAngle);

                        if (isSafeLocation(pos.lat, pos.lng)) {
                            const { char, rarity } = getRandomEmoji();
                            newItem = {
                                id: Date.now() + Math.random().toString(),
                                lat: pos.lat,
                                lng: pos.lng,
                                emoji: char,
                                rarity,
                                despawnTime: now + DESPAWN_TIMEOUT,
                                // Movement State
                                isMoving: false,
                                startLat: pos.lat,
                                startLng: pos.lng,
                                targetLat: pos.lat,
                                targetLng: pos.lng,
                                moveStartTime: 0,
                                moveDuration: 0,
                                nextMoveTime: now + 5000
                            };
                        }
                        attempts++;
                    }

                    if (newItem) {
                        next = [newItem];
                        localStorage.setItem(STORAGE_KEY, JSON.stringify({ activeItem: newItem }));
                    }
                }

                return next;
            });

        }, 5000);

        return () => clearInterval(interval);
    }, [!!userLocation]);

    // 2. MOVEMENT LOOP
    useEffect(() => {
        const moveInterval = setInterval(() => {
            setNearbyItems(prev => {
                if (prev.length === 0) return prev;
                const now = Date.now();
                const loc = locationRef.current;

                return prev.map(item => {
                    let newItem = { ...item };

                    if (item.isMoving) {
                        const progress = (now - item.moveStartTime) / item.moveDuration;
                        if (progress >= 1) {
                            newItem.isMoving = false;
                            newItem.lat = item.targetLat;
                            newItem.lng = item.targetLng;
                            newItem.nextMoveTime = now + 10000 + Math.random() * 20000; // 10s-30s pause
                        } else {
                            // simple lerp
                            newItem.lat = item.startLat + (item.targetLat - item.startLat) * progress;
                            newItem.lng = item.startLng + (item.targetLng - item.startLng) * progress;
                        }
                    } else {
                        if (now > item.nextMoveTime) {

                            // CALCULATE MOVE
                            let moveAngle;
                            if (loc) {
                                // Bias towards user
                                const dLat = loc.lat - newItem.lat;
                                const dLng = loc.lng - newItem.lng;
                                const angleToUser = Math.atan2(dLat, dLng);
                                const spread = 0.3;
                                moveAngle = angleToUser + (Math.random() * spread * 2 - spread);
                            } else {
                                moveAngle = Math.random() * 2 * Math.PI;
                            }

                            const moveDist = 60 + Math.random() * 90;

                            // Check Safety of Target
                            let target = getPointAtDist(newItem.lat, newItem.lng, moveDist, moveAngle);

                            // If unsafe, try random direction once
                            if (!isSafeLocation(target.lat, target.lng)) {
                                target = getPointAtDist(newItem.lat, newItem.lng, moveDist, Math.random() * 2 * Math.PI);
                            }

                            // If still unsafe, stay put (wait for next turn)
                            if (isSafeLocation(target.lat, target.lng)) {
                                newItem.isMoving = true;
                                newItem.moveStartTime = now;
                                newItem.startLat = newItem.lat;
                                newItem.startLng = newItem.lng;
                                newItem.targetLat = target.lat;
                                newItem.targetLng = target.lng;
                                newItem.moveDuration = (moveDist / 2.5) * 1000;
                            } else {
                                newItem.nextMoveTime = now + 5000; // Try again sooner
                            }
                        }
                    }
                    return newItem;
                });
            });
        }, 100);
        return () => clearInterval(moveInterval);
    }, []);

    // 3. INTERACTION
    useEffect(() => {
        if (!userLocation || nearbyItems.length === 0) {
            setCanCollectItem(null);
            return;
        }
        let closest = null;
        let minDst = Infinity;
        nearbyItems.forEach(item => {
            const d = dist(userLocation.lat, userLocation.lng, item.lat, item.lng);
            if (d < COLLECT_DISTANCE_M && d < minDst) {
                closest = item;
                minDst = d;
            }
        });
        setCanCollectItem(closest);
    }, [userLocation, nearbyItems]);

    // 4. ACTION
    const collectItem = async () => {
        if (!canCollectItem || !user) return false;

        // Remove locally & Set Cooldown
        setNearbyItems([]);
        const nextSpawn = Date.now() + MIN_COOLDOWN_MS + Math.random() * MAX_COOLDOWN_ADD_MS;
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ nextSpawnTime: nextSpawn }));

        try {
            const userRef = doc(db, "users", user.uid);
            await setDoc(userRef, {
                inventory: { [canCollectItem.emoji]: increment(1) },
                lastCollectedAt: serverTimestamp()
            }, { merge: true });
            return true;
        } catch (e) {
            return false;
        }
    };

    return { nearbyItems, canCollectItem, collectItem };
}
