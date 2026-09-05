// Saved (favourite) stops, kept in this browser's localStorage.
// One user, one device at a time: no account, no sync. Every access is
// wrapped in try/catch because storage can be unavailable (private mode).
import { useCallback, useEffect, useState } from 'react';

const KEY = 'kenosha-loop:favorites:v1';

export function loadFavorites() {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((s) => s && s.id != null) : [];
  } catch {
    return [];
  }
}

export function saveFavorites(list) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // storage unavailable: favourites live for this page load only
  }
}

/** React hook: [favorites, toggle(stop), isFavorite(id)] */
export function useFavorites() {
  const [favorites, setFavorites] = useState([]);
  useEffect(() => {
    setFavorites(loadFavorites());
  }, []);

  const toggle = useCallback((stop) => {
    setFavorites((prev) => {
      const id = String(stop.id);
      const exists = prev.some((s) => String(s.id) === id);
      const next = exists
        ? prev.filter((s) => String(s.id) !== id)
        : [...prev, { id, name: stop.name, lat: stop.lat, lng: stop.lng, routeIds: stop.routeIds || [], code: stop.code ?? null }];
      saveFavorites(next);
      return next;
    });
  }, []);

  const isFavorite = useCallback((id) => favorites.some((s) => String(s.id) === String(id)), [favorites]);
  return [favorites, toggle, isFavorite];
}
