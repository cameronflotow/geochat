'use client';

import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Trash2, Heart } from 'lucide-react';
import { doc, deleteDoc, updateDoc, arrayUnion, arrayRemove, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Fix for default marker icon in Leaflet
const iconUrl = 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png';
const iconRetinaUrl = 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png';
const shadowUrl = 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
    iconRetinaUrl: iconRetinaUrl,
    iconUrl: iconUrl,
    shadowUrl: shadowUrl,
});



function RecenterMap({ lat, lng }) {
    const map = useMap();
    useEffect(() => {
        // Only fly to if distance is significant or first load? 
        // For now, just keep centered or let user pan? 
        // User probably wants to explore, so maybe don't FORCE recenter constantly.
        // But initial load yes.
        // map.setView([lat, lng], map.getZoom()); 
    }, [lat, lng, map]);

    // Initial center only
    useEffect(() => {
        map.setView([lat, lng], 15);
    }, []); // eslint-disable-line
    return null;
}

export default function Map({ userLocation, chats, shouts = [], shoutRadius = 10, currentUser, onChatClick, highlightedChatIds = [], mapItems = [], canCollectItem, onCollectItem, onTooFarClick }) {
    const defaultPosition = [37.7749, -122.4194];

    const [myEmoji, setMyEmoji] = useState(null);
    const [myColor, setMyColor] = useState(null);

    useEffect(() => {
        if (!currentUser) return;
        const unsub = onSnapshot(doc(db, "users", currentUser.uid), (doc) => {
            const data = doc.data();
            setMyEmoji(data?.selectedEmoji || null);
            setMyColor(data?.markerColor || null);
        });
        return () => unsub();
    }, [currentUser]);

    const userIcon = useMemo(() => new L.DivIcon({
        className: 'user-marker',
        html: `
            <div class="relative w-9 h-9 flex items-center justify-center">
                <div class="w-6 h-6 rounded-full border-2 border-white shadow-lg animate-pulse-slow" style="background-color: ${myColor || '#16a34a'}"></div>
                ${myEmoji && Array.from(myEmoji).length <= 2 ? `<div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-sm z-50 pointer-events-none select-none leading-none pb-0.5">${myEmoji}</div>` : ''}
            </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
    }), [myEmoji, myColor]);

    // Check if user is inside any chat
    const isInside = (chat) => {
        if (!userLocation) return false;
        const R = 6371e3; // metres
        const φ1 = userLocation.lat * Math.PI / 180;
        const φ2 = chat.lat * Math.PI / 180;
        const Δφ = (chat.lat - userLocation.lat) * Math.PI / 180;
        const Δλ = (chat.lng - userLocation.lng) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const d = R * c;
        // Add 20m buffer to make it easier to click/enter
        return d <= (chat.radius + 20);
    };

    // Check if shout overlaps any chat
    const isOverlappingChat = (shout) => {
        return chats.some(chat => {
            const R = 6371e3;
            const φ1 = shout.lat * Math.PI / 180;
            const φ2 = chat.lat * Math.PI / 180;
            const Δφ = (chat.lat - shout.lat) * Math.PI / 180;
            const Δλ = (chat.lng - shout.lng) * Math.PI / 180;
            const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const d = R * c;
            return d < chat.radius;
        });
    };

    // Filter overlapping shouts (Newest wins)
    const visibleShouts = useMemo(() => {
        if (!shouts) return [];
        // Sort Newest -> Oldest
        const sorted = [...shouts].sort((a, b) => {
            const timeA = a.createdAt?.seconds || 0;
            const timeB = b.createdAt?.seconds || 0;
            return timeB - timeA;
        });

        const accepted = [];

        // Helper for simple distance
        const getDist = (p1, p2) => {
            const R = 6371e3;
            const φ1 = p1.lat * Math.PI / 180;
            const φ2 = p2.lat * Math.PI / 180;
            const Δφ = (p2.lat - p1.lat) * Math.PI / 180;
            const Δλ = (p2.lng - p1.lng) * Math.PI / 180;
            const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        };

        // Safety Filter Helper (Duplicated for failsafe independent of hook)
        const getDistMeters = (p1, p2) => {
            const R = 6371e3;
            const φ1 = p1.lat * Math.PI / 180;
            const φ2 = p2.lat * Math.PI / 180;
            const Δφ = (p2.lat - p1.lat) * Math.PI / 180;
            const Δλ = (p2.lng - p1.lng) * Math.PI / 180;
            const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        };

        for (const s of sorted) {
            if (!s.isPinned) continue;
            if (isOverlappingChat(s)) continue;

            const isBlocked = accepted.some(acc => getDist(acc, s) < 10); // 10m spacing
            if (!isBlocked) accepted.push(s);
        }
        return accepted;
    }, [shouts, chats]);

    return (
        <MapContainer
            center={userLocation ? [userLocation.lat, userLocation.lng] : defaultPosition}
            zoom={15}
            scrollWheelZoom={true}
            className="w-full h-full z-0 bg-black"
            zoomControl={false}
        >
            {/* DEBUG OVERLAY */}
            <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 9999, background: 'rgba(0,0,0,0.7)', color: 'lime', padding: '10px', borderRadius: '8px', fontSize: '10px', pointerEvents: 'none', whiteSpace: 'pre' }}>
                RADIUS: {shoutRadius}mi ({Math.round(shoutRadius * 1609.34)}m)
                {'\n'}VISIBLE SHOUTS: {visibleShouts.filter(s => {
                    const R = 6371e3;
                    if (!userLocation) return false;
                    const φ1 = userLocation.lat * Math.PI / 180;
                    const φ2 = s.lat * Math.PI / 180;
                    const Δφ = (s.lat - userLocation.lat) * Math.PI / 180;
                    const Δλ = (s.lng - userLocation.lng) * Math.PI / 180;
                    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
                    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                    const d = R * c;
                    return d <= (shoutRadius * 1609.34);
                }).length} / {shouts.length}
            </div>

            <TileLayer
                attribution='&copy; OpenStreetMap'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />

            {userLocation && (
                <>
                    <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon} zIndexOffset={10000} interactive={false}>
                        {/* <Popup>You are here</Popup> */}
                    </Marker>
                    <RecenterMap lat={userLocation.lat} lng={userLocation.lng} />
                </>
            )}



            {/* CHAT CIRCLES (Render First -> Bottom Layer) */}
            {chats.map(chat => {
                const active = isInside(chat);
                const highlighted = highlightedChatIds.includes(chat.id);

                let color = '#9d4edd'; // Default Purple
                let className = '';

                if (active) {
                    color = '#ff00ff'; // Start with Magenta so if stuck, it's correct
                    className = 'animate-pulse-color';
                }

                return (
                    <Circle
                        key={chat.id}
                        center={[chat.lat, chat.lng]}
                        radius={chat.radius}
                        pathOptions={{
                            color: color,
                            fillColor: color,
                            fillOpacity: (active || highlighted) ? 0.3 : 0.2,
                            weight: (active || highlighted) ? 2 : 1,
                            className: className
                        }}
                        eventHandlers={{
                            click: () => onChatClick(chat, active)
                        }}
                    >
                        {/* Label Marker */}
                        <Marker
                            position={[chat.lat, chat.lng]}
                            icon={new L.DivIcon({
                                className: 'chat-label',
                                html: `<div class="text-white text-xs font-bold text-center drop-shadow-md w-32 leading-tight hover:scale-110 transition-transform cursor-pointer">${chat.name}</div>`,
                                iconSize: [128, 40],
                                iconAnchor: [64, 20]
                            })}
                            eventHandlers={{
                                click: (e) => {
                                    L.DomEvent.stopPropagation(e);
                                    onChatClick(chat, active);
                                }
                            }}
                        />
                    </Circle>
                );
            })}

            {/* PINNED SHOUTS (Middle Layer) */}
            {visibleShouts.map(shout => {
                // FAILSAFE VISUAL FILTER
                if (userLocation) {
                    const R = 6371e3;
                    const φ1 = userLocation.lat * Math.PI / 180;
                    const φ2 = shout.lat * Math.PI / 180;
                    const Δφ = (shout.lat - userLocation.lat) * Math.PI / 180;
                    const Δλ = (shout.lng - userLocation.lng) * Math.PI / 180;
                    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
                    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                    const d = R * c;
                    if (d > (shoutRadius * 1609.34)) return null;
                }

                return (
                    <Marker
                        key={shout.id}
                        position={[shout.lat, shout.lng]}
                        zIndexOffset={500}
                        icon={new L.DivIcon({
                            className: 'shout-marker-container',
                            iconSize: [60, 60],
                            iconAnchor: [30, 30],
                            popupAnchor: [0, -30],
                            html: `
                                <div style="
                                    width: 60px; 
                                    height: 60px; 
                                    background: #1f2937; 
                                    border-radius: 50%;
                                    border: 4px solid white; 
                                    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); 
                                    display: flex; 
                                    align-items: center; 
                                    justify-content: center; 
                                    overflow: hidden;
                                ">
                                    <img 
                                        src="${(shout.userPhoto || `https://ui-avatars.com/api/?name=${shout.userName}&background=random`).replace(/'/g, "%27")}" 
                                        alt="${shout.userName}"
                                        style="
                                            width: 100%; 
                                            height: 100%; 
                                            object-fit: cover; 
                                            display: block;
                                        "
                                    />
                                </div>
                                <!-- Badge -->
                                <div style="
                                    position: absolute; 
                                    bottom: 0; 
                                    right: 0; 
                                    background: white; 
                                    border-radius: 9999px; 
                                    padding: 4px; 
                                    display: flex; 
                                    align-items: center; 
                                    justify-content: center; 
                                    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); 
                                    border: 1px solid #e5e7eb;
                                ">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9333ea" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                                </div>
                            `
                        })}
                    >
                        <Popup className="shout-popup" closeButton={false}>
                            <div className="p-1 min-w-[200px]">
                                <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-100">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-sm text-gray-900">{shout.userName}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {/* Like Button */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (!currentUser) return;
                                                const ref = doc(db, 'shouts', shout.id);
                                                const liked = shout.likes?.includes(currentUser.uid);
                                                updateDoc(ref, { likes: liked ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid) }).catch(console.error);
                                            }}
                                            className="group flex items-center gap-1 text-gray-400 hover:text-pink-500 transition-colors bg-gray-100 px-2 py-1 rounded-full"
                                        >
                                            <Heart
                                                size={12}
                                                className={shout.likes?.includes(currentUser?.uid) ? "fill-pink-500 text-pink-500" : ""}
                                            />
                                            <span className="text-xs font-bold">{shout.likes?.length || 0}</span>
                                        </button>

                                        {currentUser?.uid === shout.userId && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (confirm('Delete this shout?')) {
                                                        deleteDoc(doc(db, "shouts", shout.id))
                                                            .catch(error => {
                                                                console.error("Delete failed:", error);
                                                                alert("Could not delete shout. Try again.");
                                                            });
                                                    }
                                                }}
                                                className="p-1 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded transition-colors"
                                                title="Delete Shout"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="text-gray-800 text-sm leading-relaxed break-words font-medium">
                                    "{shout.text}"
                                </div>
                            </div>
                        </Popup>
                    </Marker>
                )
            })}

            {/* SHARED EMOJI ITEMS (Render Last -> Top Layer) */}
            {mapItems?.map(item => {
                const isCatchable = canCollectItem && canCollectItem.id === item.id;

                // Glow/Anim logic
                const glowClass = isCatchable ? 'drop-shadow-[0_0_15px_rgba(250,204,21,0.9)] scale-125 z-[1000]' : 'drop-shadow-xl opacity-80';
                const animClass = isCatchable ? 'animate-bounce' : 'animate-pulse';

                // Content Style (Always Emoji)
                const contentHtml = `<div class="text-3xl transition-all duration-300 ${glowClass} ${animClass}" style="animation-duration: ${isCatchable ? '1s' : '3s'}">${item.emoji}</div>`;

                return (
                    <Marker
                        key={item.id}
                        position={[item.lat, item.lng]}
                        interactive={true}
                        zIndexOffset={isCatchable ? 2000 : 1000}
                        eventHandlers={{
                            click: (e) => {
                                L.DomEvent.stopPropagation(e);
                                if (isCatchable && onCollectItem) {
                                    onCollectItem();
                                } else if (!isCatchable && onTooFarClick) {
                                    onTooFarClick();
                                }
                            }
                        }}
                        icon={new L.DivIcon({
                            className: 'emoji-marker',
                            html: contentHtml,
                            iconSize: [40, 40], // Anchor remains center
                            iconAnchor: [20, 20]
                        })}
                    />
                );
            })}
        </MapContainer>
    );
}
