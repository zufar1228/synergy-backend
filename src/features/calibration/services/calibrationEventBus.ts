/**
 * @file calibrationEventBus.ts
 * @purpose In-memory SSE event bus — relays MQTT calibration status to browser clients
 * @usedBy calibrationController (subscribe), mqtt/client (emit)
 * @deps express Response
 * @exports subscribe, unsubscribe, emit, getClientCount
 * @sideEffects SSE streaming to connected clients
 */

import { Response } from 'express';

/**
 * In-memory SSE event bus for calibration device state.
 * Relays MQTT status messages from calibration firmware to connected browser clients.
 */

interface SSEClient {
  res: Response;
  keepaliveTimer: ReturnType<typeof setInterval>;
}

// deviceId → Set of connected SSE clients
const clients = new Map<string, Set<SSEClient>>();

/** Subscribe an SSE response to events for a device */
export function subscribe(deviceId: string, res: Response): SSEClient {
  if (!clients.has(deviceId)) {
    clients.set(deviceId, new Set());
  }

  // Send SSE keepalive comment every 15s to prevent proxy/browser timeout
  const keepaliveTimer = setInterval(() => {
    try {
      res.write(':keepalive\n\n');
    } catch {
      // Client already disconnected — cleanup will happen via req.close
    }
  }, 15_000);

  const client: SSEClient = { res, keepaliveTimer };
  clients.get(deviceId)!.add(client);

  return client;
}

/** Unsubscribe an SSE client */
export function unsubscribe(deviceId: string, client: SSEClient): void {
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
export function emit(deviceId: string, data: Record<string, unknown>): void {
  const deviceClients = clients.get(deviceId);
  if (!deviceClients || deviceClients.size === 0) return;

  const payload = `data: ${JSON.stringify(data)}\n\n`;

  for (const client of deviceClients) {
    try {
      client.res.write(payload);
    } catch {
      // Client disconnected — will be cleaned up via req.close
    }
  }
}

/** Get count of connected clients (for logging/debugging) */
export function getClientCount(deviceId?: string): number {
  if (deviceId) {
    return clients.get(deviceId)?.size ?? 0;
  }
  let total = 0;
  for (const set of clients.values()) {
    total += set.size;
  }
  return total;
}
