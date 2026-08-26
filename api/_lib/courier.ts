/// <reference types="node" />
// Courier provider abstraction. No courier is invented here: providers are
// configured through environment variables and fail loudly when absent.
import { createHmac, timingSafeEqual } from 'node:crypto';

export type NormalizedTrackingEvent = {
  externalEventId: string;
  trackingNumber: string;
  status: 'pending' | 'preparing' | 'dispatched' | 'in_transit' | 'delivered' | 'failed' | 'cancelled';
  message: string;
  location?: string;
};

export interface CourierProvider {
  readonly code: string;
  createShipment(input: { fulfillmentId: string; recipientName: string; address: string; city: string; description?: string }):
    Promise<{ shipmentRef: string; trackingNumber: string }>;
  getTracking(trackingNumber: string): Promise<NormalizedTrackingEvent[]>;
  cancelShipment(shipmentRef: string): Promise<void>;
  verifyWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): boolean;
  parseWebhook(payload: unknown): NormalizedTrackingEvent;
}

export class CourierNotConfiguredError extends Error {
  constructor(providerCode: string) {
    super(`Courier provider "${providerCode}" is not configured. Set its environment credentials before calling live operations.`);
    this.name = 'COURIER_NOT_CONFIGURED';
  }
}

function header(headers: Record<string, string | string[] | undefined>, name: string): string {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Generic HMAC-SHA256 REST provider. Works with any courier exposing:
 *   POST {apiBaseUrl}/shipments        -> { shipmentRef, trackingNumber }
 *   GET  {apiBaseUrl}/track/{number}   -> { events: [...] }
 *   DELETE {apiBaseUrl}/shipments/{ref}
 *   webhook signed with X-Courier-Signature: sha256=<hex hmac of raw body>
 *
 * Required environment variables (optional until used):
 *   COURIER_API_BASE_URL, COURIER_API_KEY, COURIER_WEBHOOK_SECRET
 */
class GenericRestCourierProvider implements CourierProvider {
  readonly code = 'generic-rest';

  private config() {
    return {
      baseUrl: process.env.COURIER_API_BASE_URL,
      apiKey: process.env.COURIER_API_KEY,
      webhookSecret: process.env.COURIER_WEBHOOK_SECRET,
    };
  }

  private requireLive() {
    const { baseUrl, apiKey } = this.config();
    if (!baseUrl || !apiKey) throw new CourierNotConfiguredError(this.code);
    return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey };
  }

  private async call(path: string, init?: RequestInit) {
    const { baseUrl, apiKey } = this.requireLive();
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
    if (!response.ok) throw new Error(`COURIER_API_ERROR:${response.status}`);
    return response.json() as Promise<Record<string, unknown>>;
  }

  async createShipment(input: { fulfillmentId: string; recipientName: string; address: string; city: string; description?: string }) {
    const body = await this.call('/shipments', { method: 'POST', body: JSON.stringify(input) });
    if (typeof body.shipmentRef !== 'string' || typeof body.trackingNumber !== 'string') {
      throw new Error('INVALID_COURIER_RESPONSE');
    }
    return { shipmentRef: body.shipmentRef, trackingNumber: body.trackingNumber };
  }

  async getTracking(trackingNumber: string): Promise<NormalizedTrackingEvent[]> {
    const body = await this.call(`/track/${encodeURIComponent(trackingNumber)}`);
    return Array.isArray(body.events) ? (body.events as NormalizedTrackingEvent[]) : [];
  }

  async cancelShipment(shipmentRef: string) {
    await this.call(`/shipments/${encodeURIComponent(shipmentRef)}`, { method: 'DELETE' });
  }

  verifyWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): boolean {
    const secret = this.config().webhookSecret;
    if (!secret) return false; // no secret configured => never trust webhooks
    const provided = header(headers, 'x-courier-signature');
    if (!provided.startsWith('sha256=')) return false;
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    return safeEqual(provided.slice('sha256='.length), expected);
  }

  // Generic payload contract:
  // { eventId, trackingNumber, status, message?, location? }
  parseWebhook(payload: unknown): NormalizedTrackingEvent {
    const p = (payload || {}) as Record<string, unknown>;
    const status = String(p.status || '');
    const allowed = new Set(['pending', 'preparing', 'dispatched', 'in_transit', 'delivered', 'failed', 'cancelled']);
    if (typeof p.eventId !== 'string' || typeof p.trackingNumber !== 'string' || !allowed.has(status)) {
      throw new Error('INVALID_WEBHOOK_PAYLOAD');
    }
    return {
      externalEventId: p.eventId,
      trackingNumber: p.trackingNumber,
      status: status as NormalizedTrackingEvent['status'],
      message: typeof p.message === 'string' ? p.message : `Shipment is ${status}.`,
      location: typeof p.location === 'string' ? p.location : undefined,
    };
  }
}

const registry = new Map<string, CourierProvider>([
  ['generic-rest', new GenericRestCourierProvider()],
]);

/** Resolve a provider by code. Unknown providers fail clearly instead of pretending. */
export function getCourierProvider(code: string | null | undefined): CourierProvider {
  const key = (code && code.trim()) || 'generic-rest';
  const provider = registry.get(key);
  if (!provider) throw new CourierNotConfiguredError(key);
  return provider;
}

/** Register an additional concrete provider implementation at startup. */
export function registerCourierProvider(provider: CourierProvider) {
  registry.set(provider.code, provider);
}



