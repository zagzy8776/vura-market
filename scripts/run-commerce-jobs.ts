/** Dedicated, bounded commerce-outbox tick. Requires staging-tested migrations 034–036. */
import { tickCommerceOutbox } from './commerce-outbox.js';

const stats = await tickCommerceOutbox();
console.log('Commerce notification jobs:', stats);
