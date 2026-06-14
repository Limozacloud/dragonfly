import PocketBase from 'pocketbase';

export const PB_PRESENCE = 'df_presence';
export const HEARTBEAT_MS = 20_000;
const STALE_MS = 60_000;

export function getDeviceId(): string {
  let id = localStorage.getItem('dragonfly_device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('dragonfly_device_id', id);
  }
  return id;
}

export async function announcePresence(
  pb: PocketBase,
  recordId: string,
  collection: string
): Promise<string | null> {
  const deviceId = getDeviceId();
  const now = new Date().toISOString();
  try {
    try {
      const existing = await pb
        .collection(PB_PRESENCE)
        .getFirstListItem(`record_id="${recordId}"&&device_id="${deviceId}"`);
      await pb.collection(PB_PRESENCE).update(existing.id, { last_seen: now });
      return existing.id;
    } catch {
      const created = await pb.collection(PB_PRESENCE).create({
        record_id: recordId,
        collection,
        device_id: deviceId,
        last_seen: now,
      });
      return created.id as string;
    }
  } catch {
    return null;
  }
}

export async function withdrawPresence(pb: PocketBase, presenceId: string): Promise<void> {
  try {
    await pb.collection(PB_PRESENCE).delete(presenceId);
  } catch {
    // Already gone
  }
}

export async function heartbeatPresence(
  pb: PocketBase,
  presenceId: string,
  recordId: string,
  collection: string
): Promise<string> {
  try {
    await pb.collection(PB_PRESENCE).update(presenceId, { last_seen: new Date().toISOString() });
    return presenceId;
  } catch {
    // Record was cleaned up — re-announce
    return (await announcePresence(pb, recordId, collection)) ?? presenceId;
  }
}

export async function getOthersCount(pb: PocketBase, recordId: string): Promise<number> {
  const deviceId = getDeviceId();
  const staleThreshold = new Date(Date.now() - STALE_MS).toISOString();
  try {
    const records = await pb.collection(PB_PRESENCE).getFullList({
      filter: `record_id="${recordId}"&&device_id!="${deviceId}"&&last_seen>="${staleThreshold}"`,
    });
    return records.length;
  } catch {
    return 0;
  }
}

export function subscribePresence(
  pb: PocketBase,
  recordId: string,
  onChange: (count: number) => void
): () => void {
  let unsubFn: (() => void) | null = null;

  pb.collection(PB_PRESENCE)
    .subscribe('*', async (e) => {
      if ((e.record as Record<string, unknown>).record_id === recordId) {
        const count = await getOthersCount(pb, recordId);
        onChange(count);
      }
    })
    .then((unsub) => {
      unsubFn = unsub;
    })
    .catch(() => {});

  return () => {
    unsubFn?.();
  };
}

export function getPresenceFields() {
  return [
    { name: 'record_id', type: 'text', required: true },
    { name: 'collection', type: 'text', required: false },
    { name: 'device_id', type: 'text', required: true },
    { name: 'last_seen', type: 'text', required: false },
  ];
}
