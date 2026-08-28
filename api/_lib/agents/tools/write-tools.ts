/**
 * Phase O — governed WRITE tools. All require approval before execution.
 * No unrestricted production access.
 */
import type { AgentTool } from '../types.js';
import { sql } from '../../db.js';

export const productCreateProposeTool: AgentTool = {
  name: 'product.create',
  description: 'Propose creating a product draft. WRITE risk — requires human approval; does not publish.',
  risk: 'write',
  async execute(input) {
    // Proposal only when called without approval path; actual insert happens post-approval via admin
    return {
      proposed: true,
      action: 'product.create',
      input,
      note: 'Awaiting human approval before any database write',
    };
  },
};

export const inventoryUpdateTool: AgentTool = {
  name: 'inventory.update',
  description: 'Propose inventory/stock status change. WRITE — requires approval.',
  risk: 'write',
  async execute(input) {
    return { proposed: true, action: 'inventory.update', input, note: 'Awaiting approval' };
  },
};

export const shippingUpdateTool: AgentTool = {
  name: 'shipping.update',
  description: 'Propose shipping/tracking update. WRITE — requires approval.',
  risk: 'write',
  async execute(input) {
    return { proposed: true, action: 'shipping.update', input, note: 'Awaiting approval' };
  },
};

export const notificationSendTool: AgentTool = {
  name: 'notification.send',
  description: 'Propose customer notification. WRITE — requires approval. Never auto-send.',
  risk: 'write',
  async execute(input) {
    return { proposed: true, action: 'notification.send', input, note: 'Human must send customer messages' };
  },
};

/** Execute approved write — only called after approval decision */
export async function executeApprovedWrite(toolName: string, input: Record<string, unknown>) {
  if (toolName === 'inventory.update') {
    const productId = String(input.productId || '');
    const stockStatus = String(input.stockStatus || '');
    if (!productId || !stockStatus) throw new Error('productId and stockStatus required');
    const rows = await sql`
      UPDATE products SET stock_status = ${stockStatus}, updated_at = now()
      WHERE id = ${productId}::uuid
      RETURNING id, name, stock_status`;
    return { updated: rows[0] || null };
  }
  if (toolName === 'shipping.update') {
    const orderId = String(input.orderId || '');
    const trackingNumber = String(input.trackingNumber || '');
    if (!orderId || !trackingNumber) throw new Error('orderId and trackingNumber required');
    const rows = await sql`
      UPDATE orders SET tracking_number = ${trackingNumber}, status = COALESCE(${String(input.status || '')}::text, status), updated_at = now()
      WHERE id = ${orderId}::uuid
      RETURNING id, order_number, tracking_number, status`;
    // Note: Resend email would be triggered by existing order flows — not silent here
    return { updated: rows[0] || null, emailNote: 'Trigger customer tracking email via existing order notification flow if configured' };
  }
  // product.create / notification.send remain propose-only until dedicated flows exist
  return { executed: false, toolName, note: 'Approved but executor not implemented for this tool — no silent side effect' };
}
