"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscribe = subscribe;
exports.unsubscribe = unsubscribe;
exports.emit = emit;
exports.getClientCount = getClientCount;
// deviceId → Set of connected SSE clients
const clients = new Map();
/** Subscribe an SSE response to events for a device */
function subscribe(deviceId, res) {
    if (!clients.has(deviceId)) {
        clients.set(deviceId, new Set());
    }
    // Send SSE keepalive comment every 15s to prevent proxy/browser timeout
    const keepaliveTimer = setInterval(() => {
        try {
            res.write(':keepalive\n\n');
        }
        catch {
            // Client already disconnected — cleanup will happen via req.close
        }
    }, 15000);
    const client = { res, keepaliveTimer };
    clients.get(deviceId).add(client);
    return client;
}
/** Unsubscribe an SSE client */
function unsubscribe(deviceId, client) {
    clearInterval(client.keepaliveTimer);
    const deviceClients = clients.get(deviceId);
    if (deviceClients) {
        deviceClients.delete(client);
        if (deviceClients.size === 0) {
            clients.delete(deviceId);
        }
    }
}
/** Emit a status event to all SSE clients for a device */
function emit(deviceId, data) {
    const deviceClients = clients.get(deviceId);
    if (!deviceClients || deviceClients.size === 0)
        return;
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of deviceClients) {
        try {
            client.res.write(payload);
        }
        catch {
            // Client disconnected — will be cleaned up via req.close
        }
    }
}
/** Get count of connected clients (for logging/debugging) */
function getClientCount(deviceId) {
    if (deviceId) {
        return clients.get(deviceId)?.size ?? 0;
    }
    let total = 0;
    for (const set of clients.values()) {
        total += set.size;
    }
    return total;
}
