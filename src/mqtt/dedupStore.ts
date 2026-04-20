/**
 * @file dedupStore.ts
 * @purpose QoS1 deduplication store for recently processed MQTT messages
 * @usedBy mqtt message router
 * @deps none
 * @exports isDuplicate
 * @sideEffects Maintains in-memory map and periodic pruning timer
 */

const DEDUP_WINDOW_MS = 10_000;
const recentMessages = new Map<string, number>();

export const isDuplicate = (
  deviceId: string,
  topicSuffix: string,
  payloadHash: string
): boolean => {
  const key = `${deviceId}:${topicSuffix}:${payloadHash}`;
  const now = Date.now();
  const previousTimestamp = recentMessages.get(key);

  if (previousTimestamp && now - previousTimestamp < DEDUP_WINDOW_MS) {
    return true;
  }

  recentMessages.set(key, now);
  return false;
};

setInterval(() => {
  const cutoff = Date.now() - DEDUP_WINDOW_MS;
  for (const [key, timestamp] of recentMessages) {
    if (timestamp < cutoff) {
      recentMessages.delete(key);
    }
  }
}, DEDUP_WINDOW_MS);
