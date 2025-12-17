import { useState, useEffect } from 'react';

export function useLocation() {
    const [location, setLocation] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!navigator.geolocation) {
            setError("Geolocation not supported");
            return;
        }

        const watcher = navigator.geolocation.watchPosition(
            (pos) => {
                setLocation({
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    heading: pos.coords.heading // useful for bearing later maybe
                });
            },
            (err) => {
                setError(err.message);
                console.error("Location error", err);
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
        );

        return () => navigator.geolocation.clearWatch(watcher);
    }, []);

    return { location, error };
}
