'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { User } from 'lucide-react';

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

// Custom User Icon
const userIcon = new L.DivIcon({
    className: 'relative',
    html: `<div class="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-lg animate-pulse-slow"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10]
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
        map.setView([lat, lng], 18);
    }, []); // eslint-disable-line
    return null;
}

export default function Map({ userLocation, chats, onChatClick, highlightedChatIds = [] }) {
    const defaultPosition = [37.7749, -122.4194];

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

    return (
        <MapContainer
            center={userLocation ? [userLocation.lat, userLocation.lng] : defaultPosition}
            zoom={17}
            scrollWheelZoom={true}
            className="w-full h-full z-0 bg-[#1a1a1a]"
            zoomControl={false}
        >
            <TileLayer
                attribution='&copy; OpenStreetMap'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />

            {userLocation && (
                <>
                    <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}>
                        {/* <Popup>You are here</Popup> */}
                    </Marker>
                    <RecenterMap lat={userLocation.lat} lng={userLocation.lng} />
                </>
            )}

            {chats.map(chat => {
                const active = isInside(chat);
                const highlighted = highlightedChatIds.includes(chat.id);

                let color = '#9d4edd'; // Default Purple
                if (highlighted) color = '#ffffff'; // White if highlighted
                else if (active) color = '#ff00ff'; // OSciillating if inside

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
                            className: highlighted ? 'animate-pulse' : (active ? 'animate-pulse-slow' : '')
                        }}
                        eventHandlers={{
                            click: () => onChatClick(chat, active)
                        }}
                    >
                        {/* We can use a DivIcon marker for the label to center it */}
                        <Marker
                            position={[chat.lat, chat.lng]}
                            icon={new L.DivIcon({
                                className: 'chat-label',
                                html: `<div class="text-white text-xs font-bold text-center drop-shadow-md w-32 -ml-16 leading-tight">${chat.name}</div>`,
                            })}
                            eventHandlers={{
                                click: () => onChatClick(chat, active)
                            }}
                        />
                    </Circle>
                );
            })}
        </MapContainer>
    );
}
