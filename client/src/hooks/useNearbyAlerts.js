import { useEffect, useRef } from 'react';
import api from '../services/api';

const ALERT_RADIUS_KM  = 1;      // notify when within 1 km
const MIN_MOVE_METERS  = 150;    // only recheck if moved 150m
const COOLDOWN_MS      = 60 * 60 * 1000; // 1 hour per shop

function distKm(lat1, lng1, lat2, lng2) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function wasRecentlyAlerted(shopId) {
  try {
    const ts = parseInt(localStorage.getItem(`nearby_alert_${shopId}`) || '0');
    return Date.now() - ts < COOLDOWN_MS;
  } catch { return false; }
}

function markAlerted(shopId) {
  try { localStorage.setItem(`nearby_alert_${shopId}`, String(Date.now())); } catch {}
}

function showNotification(shop) {
  const dist = shop.distance_km < 1
    ? `${Math.round(shop.distance_km * 1000)}m away`
    : `${shop.distance_km.toFixed(1)}km away`;
  const title = `📍 ${shop.name} is nearby!`;
  const body  = shop.best_discount
    ? `${shop.best_discount}% OFF — ${shop.top_offer}  (${dist})`
    : `Check out offers at ${shop.name}  (${dist})`;
  const url   = shop.slug ? `/shop/${shop.slug}` : '/';

  // Use Service Worker notification if available (works even when tab is in background)
  if ('serviceWorker' in navigator && Notification.permission === 'granted') {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(title, {
        body,
        icon:  '/favicon.ico',
        badge: '/favicon.ico',
        tag:   `nearby-${shop.id}`,   // replaces previous notification for same shop
        data:  { url },
        vibrate: [200, 100, 200],
      });
    });
  }
}

export default function useNearbyAlerts() {
  const lastPos    = useRef(null);
  const watchId    = useRef(null);
  const permission = useRef(Notification.permission);

  useEffect(() => {
    if (!('geolocation' in navigator)) return;

    async function onPosition(pos) {
      const { latitude: lat, longitude: lng } = pos.coords;

      // Skip if not moved enough
      if (lastPos.current) {
        const movedKm = distKm(lastPos.current.lat, lastPos.current.lng, lat, lng);
        if (movedKm * 1000 < MIN_MOVE_METERS) return;
      }
      lastPos.current = { lat, lng };

      // Request notification permission if not yet granted
      if (permission.current === 'default') {
        permission.current = await Notification.requestPermission();
      }
      if (permission.current !== 'granted') return;

      try {
        const res = await api.get(`/push/nearby-shops?lat=${lat}&lng=${lng}&km=${ALERT_RADIUS_KM}`);
        const shops = res.data || [];
        for (const shop of shops) {
          if (!wasRecentlyAlerted(shop.id)) {
            showNotification(shop);
            markAlerted(shop.id);
          }
        }
      } catch { /* silent — don't interrupt UX on network error */ }
    }

    watchId.current = navigator.geolocation.watchPosition(onPosition, null, {
      enableHighAccuracy: false,
      maximumAge:         30000,   // accept 30s old position
      timeout:            15000,
    });

    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, []);
}
