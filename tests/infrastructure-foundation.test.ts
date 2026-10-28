import { describe, expect, it, vi } from 'vitest';
vi.mock('../api/_lib/db.js', () => ({ sql: vi.fn() }));
vi.mock('../api/_lib/notifications.js', () => ({ notifyUser: vi.fn() }));
import { catalogueCacheKey, publicCacheConfigured } from '../api/_lib/public-cache.js';
import { commerceWorkerEnabled, notificationCopy } from '../api/_lib/commerce-outbox.js';

describe('infrastructure boundaries', () => {
 it('creates stable cache keys from public filters', () => {
   const a=catalogueCacheKey({q:'laptop',state:'LA',page:1});
   expect(a).toBe(catalogueCacheKey({q:'laptop',state:'LA',page:1}));
   expect(a).not.toBe(catalogueCacheKey({q:'laptop',state:'LA',page:2}));
   expect(a).not.toContain('laptop');
 });
 it('requires an explicit cache opt-in', () => {
   const old=process.env.PUBLIC_CATALOG_CACHE_ENABLED;
   delete process.env.PUBLIC_CATALOG_CACHE_ENABLED;
   expect(publicCacheConfigured()).toBe(false);
   if(old!==undefined)process.env.PUBLIC_CATALOG_CACHE_ENABLED=old;
 });
 it('requires an explicit commerce worker opt-in', () => {
   const old=process.env.COMMERCE_OUTBOX_ENABLED;
   delete process.env.COMMERCE_OUTBOX_ENABLED;
   expect(commerceWorkerEnabled()).toBe(false);
   if(old!==undefined)process.env.COMMERCE_OUTBOX_ENABLED=old;
 });
 it('notifies sellers about waiting purchase requests', () => {
   const copy=notificationCopy('requested',{order_number:'20261028000421',listing_title:'Phone',quantity:1});
   expect(copy?.title).toMatch(/purchase/i);
   expect(copy?.body).toMatch(/confirm/i);
 });
 it('never tells buyers to pay without confirmed checkout', () => {
   const copy=notificationCopy('accepted',{order_number:'20261028000421',listing_title:'Phone',quantity:1});
   expect(copy?.body).toMatch(/Do not pay/);
 });
 it('does not silently send unsupported notification types', () => {
   expect(notificationCopy('disburse_funds',{order_number:'1',listing_title:'a',quantity:1})).toBeNull();
 });
});
