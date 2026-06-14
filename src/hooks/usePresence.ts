import { useEffect, useState, useRef } from 'react';
import { syncService } from '../services/syncService';
import {
  announcePresence,
  withdrawPresence,
  heartbeatPresence,
  getOthersCount,
  subscribePresence,
  HEARTBEAT_MS,
} from '../services/presenceService';

export function usePresence(recordId: string | null | undefined, collection: string): number {
  const [othersCount, setOthersCount] = useState(0);
  const presenceIdRef = useRef<string | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const pb = syncService.pocketBase;
    if (!recordId || !pb) return;

    let cancelled = false;
    let unsubPresence: (() => void) | null = null;

    (async () => {
      const id = await announcePresence(pb, recordId, collection);
      if (cancelled) {
        if (id) await withdrawPresence(pb, id);
        return;
      }
      presenceIdRef.current = id;

      const count = await getOthersCount(pb, recordId);
      if (!cancelled) setOthersCount(count);

      unsubPresence = subscribePresence(pb, recordId, (c) => {
        if (!cancelled) setOthersCount(c);
      });

      heartbeatRef.current = setInterval(async () => {
        const pb2 = syncService.pocketBase;
        if (!pb2 || !presenceIdRef.current) return;
        presenceIdRef.current = await heartbeatPresence(pb2, presenceIdRef.current, recordId, collection);
      }, HEARTBEAT_MS);
    })();

    return () => {
      cancelled = true;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      unsubPresence?.();
      const pb2 = syncService.pocketBase;
      if (pb2 && presenceIdRef.current) withdrawPresence(pb2, presenceIdRef.current);
      presenceIdRef.current = null;
      setOthersCount(0);
    };
  }, [recordId, collection]);

  return othersCount;
}
