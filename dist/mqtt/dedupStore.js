"use strict";
/**
 * @file dedupStore.ts
 * @purpose QoS1 deduplication store for recently processed MQTT messages
 * @usedBy mqtt message router
 * @deps none
 * @exports isDuplicate
 * @sideEffects Maintains in-memory map and periodic pruning timer
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDuplicate = void 0;
const DEDUP_WINDOW_MS = 10000;
const recentMessages = new Map();
const isDuplicate = (deviceId, topicSuffix, payloadHash) => {
    const key = `${deviceId}:${topicSuffix}:${payloadHash}`;
    const now = Date.now();
    const previousTimestamp = recentMessages.get(key);
    if (previousTimestamp && now - previousTimestamp < DEDUP_WINDOW_MS) {
        return true;
    }
    recentMessages.set(key, now);
    return false;
};
exports.isDuplicate = isDuplicate;
setInterval(() => {
    const cutoff = Date.now() - DEDUP_WINDOW_MS;
    for (const [key, timestamp] of recentMessages) {
        if (timestamp < cutoff) {
            recentMessages.delete(key);
        }
    }
}, DEDUP_WINDOW_MS);
