import { useCallback, useEffect, useRef, useState } from 'react';

const IDLE = { data: null, error: null, loading: false, updatedAt: null };

/**
 * Poll an async fetcher on an interval.
 *
 * - `key` identifies what is being polled; changing it restarts polling
 *   (and clears the previous data unless keepPrevious is set).
 * - Slows down 4x while the tab is hidden and refetches immediately when it
 *   becomes visible again.
 * - Errors keep the last good data so the UI can show stale-but-useful info.
 */
export function usePolling(key, fetcher, intervalMs, { enabled = true, keepPrevious = false } = {}) {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [state, setState] = useState({ ...IDLE, loading: enabled });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setState(IDLE);
      return undefined;
    }
    let cancelled = false;
    let timer = null;

    setState((s) => (keepPrevious ? { ...s, loading: true } : { ...IDLE, loading: true }));

    const schedule = () => {
      if (cancelled) return;
      const hidden = typeof document !== 'undefined' && document.hidden;
      timer = setTimeout(run, hidden ? intervalMs * 4 : intervalMs);
    };

    async function run() {
      try {
        const data = await fetcherRef.current();
        if (!cancelled) setState({ data, error: null, loading: false, updatedAt: Date.now() });
      } catch (error) {
        if (!cancelled) setState((s) => ({ ...s, error, loading: false }));
      } finally {
        schedule();
      }
    }

    const onVisibility = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        run();
      }
    };

    run();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [key, intervalMs, enabled, keepPrevious, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, refresh };
}
