import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';

vi.mock('../api/_lib/db', () => {
  const json = (res: unknown, status: number, body: unknown) => {
    const r = res as { _code?: number; _body?: unknown; setHeader: () => void; status: (code: number) => { json: (b: unknown) => void }; on: () => void };
    r._code = status;
    r._body = body;
  };
  return { sql: vi.fn(), json };
});

import { sql } from '../api/_lib/db';
import handler from '../api/couriers/webhook';
import { getCourierProvider, CourierNotConfiguredError } from '../api/_lib/courier';

type TestRes = {
  setHeader: (key: string, value: string) => void;
  status: (code: number) => { json: (body: unknown) => void };
  _code?: number;
  _body?: unknown;
};

function makeRes(): TestRes {
  const res: TestRes = { setHeader: () => undefined, status: () => ({ json: () => undefined }) } as TestRes;
  res.status = (code: number) => ({
    json: (body: unknown) => {
      res._code = code;
      res._body = body;
    },
  });
  return res;
}

const mockedSql = () => vi.mocked(sql);

function signed(payload: string, secret = 'test-secret') {
  return `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.COURIER_WEBHOOK_SECRET = 'test-secret';
  delete process.env.COURIER_API_BASE_URL;
  delete process.env.COURIER_API_KEY;
});

describe('courier webhook endpoint', () => {
  it('rejects an invalid signature with 401 and records nothing', async () => {
    const req = {
      method: 'POST',
      query: { provider: 'generic-rest' },
      headers: { 'x-courier-signature': 'sha256=deadbeef' },
      on: (name: string, cb: (chunk?: unknown) => void) => {
        if (name === 'data') cb(Buffer.from(''));
        if (name === 'end') cb();
      },
    } as never;
    await handler(req, makeRes() as never);
    expect(mockedSql()).not.toHaveBeenCalled();
  });

  it('rejects webhooks when no secret is configured (fail closed)', async () => {
    delete process.env.COURIER_WEBHOOK_SECRET;
    const payload = JSON.stringify({ eventId: 'evt-1', trackingNumber: 'TRK-1', status: 'delivered' });
    const req = {
      method: 'POST',
      query: { provider: 'generic-rest' },
      headers: { 'x-courier-signature': signed(payload) },
      on: (name: string, cb: (chunk?: unknown) => void) => {
        if (name === 'data') cb(Buffer.from(''));
        if (name === 'end') cb();
      },
    } as never;
    const res = makeRes();
    await handler(req, res as never);
    expect(res._code).toBe(401);
  });

  it('accepts a valid signature and processes the event idempotently', async () => {
    const payload = JSON.stringify({ eventId: 'evt-42', trackingNumber: 'TRK-9', status: 'delivered', location: 'Lagos' });
    mockedSql()
      .mockResolvedValueOnce([{ id: 7 }]) // insert event
      .mockResolvedValueOnce([{ id: 99 }]) // apply_courier_tracking_event
      .mockResolvedValueOnce([]); // mark processed
    const req = {
      method: 'POST',
      query: { provider: 'generic-rest' },
      headers: { 'x-courier-signature': signed(payload), 'content-type': 'application/json' },
      on: (name: string, cb: (chunk?: unknown) => void) => {
        if (name === 'data') cb(payload);
        if (name === 'end') cb();
      },
    } as never;
    const res = makeRes();
    await handler(req, res as never);
    expect(res._code).toBe(200);
  });
});

describe('courier provider abstraction', () => {
  it('fails clearly for an unconfigured provider code instead of pretending', () => {
    expect(() => getCourierProvider('does-not-exist')).toThrow(CourierNotConfiguredError);
  });

  it('refuses live operations without credentials', async () => {
    const provider = getCourierProvider('generic-rest');
    await expect(provider.createShipment({ fulfillmentId: 'f', recipientName: 'a', address: 'b', city: 'c' })).rejects.toThrow(CourierNotConfiguredError);
  });

  it('normalizes a generic payload and rejects malformed ones', () => {
    const provider = getCourierProvider('generic-rest');
    const event = provider.parseWebhook({ eventId: 'e1', trackingNumber: 'T1', status: 'dispatched' });
    expect(event.status).toBe('dispatched');
    expect(event.message).toBe('Shipment is dispatched.');
    expect(() => provider.parseWebhook({ eventId: 'e2', trackingNumber: 'T1', status: 'teleported' })).toThrow('INVALID_WEBHOOK_PAYLOAD');
  });
});
