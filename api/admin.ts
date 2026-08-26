import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from './_lib/db.js';
import { requireAdmin, requireAdminPermission } from './_lib/auth.js';
import { recordAudit, recordOrderEvent } from './_lib/audit.js';
import { simpleOrderEmail } from './_lib/email.js';
import { notifyUser } from './_lib/notifications.js';
import { applySecurityHeaders, rejectUnsupportedMethod } from './_lib/http.js';

const orderStatuses = new Set(['awaiting_payment','payment_verification','confirmed','sourcing','purchased','out_for_delivery','delivered','cancelled']);
const sourcingStatuses = new Set(['awaiting_confirmation','confirmed','sourcing','purchased','out_for_delivery','delivered','cancelled']);
const paymentStatuses = new Set(['unpaid','pending_verification','paid','rejected']);
const stockStatuses = new Set(['available','low_stock','out_of_stock','unavailable']);
const fulfillmentStatuses = new Set(['pending','preparing','dispatched','in_transit','delivered','failed','cancelled']);
const refundStatuses = new Set(['requested','approved','processing','completed','rejected','failed']);
const rmaStatuses = new Set(['requested','approved','return_in_transit','received','inspecting','refunded','replaced','rejected','cancelled']);

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
type Dispatcher = (req: VercelRequest, res: VercelResponse, adminId: string) => Promise<void> | void;

const handlers: Record<string, Partial<Record<Method, Dispatcher>>> = {
  overview: { GET: (req, res, adminId) => overview(req, res, adminId) },
  orders: { GET: orders, PATCH: orders },
  products: { GET: products, POST: products, PATCH: products },
  categories: { GET: (req, res, adminId) => categories(req, res, adminId) },
  suppliers: { GET: suppliers, POST: suppliers, PATCH: suppliers },
  customers: { GET: (req, res, adminId) => customers(req, res, adminId) },
  notifications: { GET: (req, res, adminId) => notifications(req, res, adminId) },
  delivery: { GET: delivery, POST: delivery, PATCH: delivery },
  finance: { GET: finance },
  refunds: { GET: refunds, POST: refunds, PATCH: refunds },
};

function resource(req: VercelRequest) {
  const value = req.query.resource;
  if (Array.isArray(value)) return value[0];
  return value || '';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applySecurityHeaders(res);
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const r = resource(req);
  const methods = handlers[r];
  if (!methods) return json(res, 404, { error: 'Admin resource not found.' });
  const method = (req.method || 'GET') as Method;
  const fn = methods[method];
  if (!fn) return json(res, 405, { error: 'Method not allowed for this admin resource.' });
  try {
    await fn(req, res, admin.id);
  } catch (error: any) {
    const code = String(error?.message || '');
    if (code.includes('ORDER_NOT_FOUND') || code.includes('FULFILLMENT_NOT_FOUND')) return json(res, 404, { error: 'Resource not found.' });
    if (code.includes('INVALID')) return json(res, 400, { error: 'Invalid operation parameters.' });
    return json(res, 500, { error: 'The admin operation could not be completed.' });
  }
}

async function overview(req: VercelRequest, res: VercelResponse, adminId: string) {
  const admin = await requireAdminPermission(req, res, 'dashboard.read');
  if (!admin) return;
  
  const [products, orders, revenue, profit, customersRows, notificationsRows, audit, orderEvents] = await Promise.all([
    sql`SELECT COUNT(*)::int AS count FROM products WHERE is_active = true`,
    sql`SELECT COUNT(*)::int AS count FROM orders WHERE created_at >= date_trunc('month', now())`,
    sql`SELECT COALESCE(SUM(total_kobo),0)::bigint AS amount FROM orders WHERE payment_status = 'paid' AND created_at >= date_trunc('month', now())`,
    sql`SELECT COALESCE(SUM(actual_profit_kobo),0)::bigint AS amount FROM orders WHERE payment_status = 'paid' AND actual_profit_kobo IS NOT NULL AND created_at >= date_trunc('month', now())`,
    sql`SELECT u.id,u.name,u.email,u.role,u.created_at,COUNT(o.id)::int AS order_count,COALESCE(SUM(CASE WHEN o.payment_status='paid' THEN o.total_kobo ELSE 0 END),0)::bigint AS total_spend_kobo FROM users u LEFT JOIN orders o ON o.buyer_id=u.id WHERE u.role='customer' GROUP BY u.id ORDER BY u.created_at DESC LIMIT 1000`,
    sql`SELECT n.id,n.user_id,n.order_id,n.type,n.title,n.body,n.created_at,u.email AS user_email,o.order_number FROM notifications n LEFT JOIN users u ON u.id=n.user_id LEFT JOIN orders o ON o.id=n.order_id ORDER BY n.created_at DESC LIMIT 300`,
    sql`SELECT a.id,a.action,a.entity_type,a.entity_id,a.before_data,a.after_data,a.metadata,a.created_at,u.name AS actor_name,u.email AS actor_email FROM audit_log a LEFT JOIN users u ON u.id=a.actor_user_id ORDER BY a.created_at DESC LIMIT 200`,
    sql`SELECT e.id,e.order_id,e.event_type,e.from_status,e.to_status,e.note,e.metadata,e.created_at,e.actor_user_id,u.name AS actor_name,o.order_number FROM order_events e LEFT JOIN users u ON u.id=e.actor_user_id LEFT JOIN orders o ON o.id=e.order_id ORDER BY e.created_at DESC LIMIT 300`,
  ]);
  return json(res,200,{liveProducts:products[0].count,monthlyOrders:orders[0].count,monthlyRevenueKobo:revenue[0].amount,monthlyProfitKobo:profit[0].amount,customers:customersRows,notifications:notificationsRows,audit,orderEvents});
}

async function customers(req: VercelRequest, res: VercelResponse, adminId: string) {
  const admin = await requireAdminPermission(req, res, 'customers.read');
  if (!admin) return;
  
  const rows = await sql`SELECT u.id,u.name,u.email,u.role,u.created_at,COUNT(o.id)::int AS order_count,COALESCE(SUM(o.total_kobo),0)::bigint AS total_spend_kobo FROM users u LEFT JOIN orders o ON o.buyer_id=u.id WHERE u.role='customer' GROUP BY u.id ORDER BY total_spend_kobo DESC LIMIT 500`;
  return json(res,200,{customers:rows});
}

async function notifications(req: VercelRequest, res: VercelResponse, adminId: string) {
  const admin = await requireAdminPermission(req, res, 'notifications.read');
  if (!admin) return;
  
  const rows = await sql`SELECT n.id,n.user_id,n.order_id,n.type,n.title,n.body,n.created_at,u.email AS user_email,o.order_number FROM notifications n LEFT JOIN users u ON u.id=n.user_id LEFT JOIN orders o ON o.id=n.order_id ORDER BY n.created_at DESC LIMIT 200`;
  return json(res,200,{notifications:rows});
}

async function categories(req: VercelRequest, res: VercelResponse, adminId: string) {
  const admin = await requireAdminPermission(req, res, 'categories.read');
  if (!admin) return;
  
  const rows = await sql`SELECT id,name,slug,icon FROM categories ORDER BY name ASC`;
  return json(res,200,{categories:rows});
}

async function products(req: VercelRequest,res: VercelResponse,adminId:string) {
  const permission = req.method === 'GET' ? 'products.read' : (req.method === 'POST' ? 'products.create' : 'products.write');
  const admin = await requireAdminPermission(req, res, permission);
  if (!admin) return;
  
  if (req.method==='GET') {
    const rows=await sql`SELECT p.id,p.name,p.brand,p.price_kobo,p.condition_label,p.storage,p.color,p.stock_status,p.is_active,p.source_price_kobo,p.source_location,p.expected_cost_kobo,p.verified_at,s.name AS supplier_name,c.name AS category,ARRAY_AGG(pi.image_url ORDER BY pi.sort_order) FILTER (WHERE pi.image_url IS NOT NULL) AS images FROM products p LEFT JOIN suppliers s ON s.id=p.supplier_id LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN product_images pi ON pi.product_id=p.id GROUP BY p.id,s.name,c.name ORDER BY p.created_at DESC LIMIT 500`;
    return json(res,200,{products:rows});
  }
  if(req.method==='POST') {
    const body=req.body||{};
    const name=typeof body.name==='string'?body.name.trim():'';
    const brand=typeof body.brand==='string'?body.brand.trim():'';
    const description=typeof body.description==='string'?body.description.trim():'';
    const price=Number(body.priceKobo);
    const sourcePrice=body.sourcePriceKobo==null||body.sourcePriceKobo===''?null:Number(body.sourcePriceKobo);
    const condition=typeof body.conditionLabel==='string'&&body.conditionLabel.trim()?body.conditionLabel.trim():'New';
    const stock=typeof body.stockStatus==='string'?body.stockStatus:'available';
    if(name.length<2||brand.length<1) return json(res,400,{error:'Product name and brand are required.'});
    if(!Number.isFinite(price)||price<=0) return json(res,400,{error:'Product price must be greater than zero.'});
    if(sourcePrice!==null&&(!Number.isFinite(sourcePrice)||sourcePrice<0)) return json(res,400,{error:'Source price is invalid.'});
    if(!stockStatuses.has(stock)) return json(res,400,{error:'Invalid stock status.'});
    if(body.categoryId!=null&&typeof body.categoryId!=='string') return json(res,400,{error:'Category is invalid.'});
    if(body.supplierId!=null&&typeof body.supplierId!=='string') return json(res,400,{error:'Supplier is invalid.'});
    const rows=await sql`INSERT INTO products(seller_id,category_id,supplier_id,name,brand,description,price_kobo,condition_label,storage,color,stock_status,source_price_kobo,source_location,expected_cost_kobo,is_active,verified_at) VALUES(${adminId},${body.categoryId||null},${body.supplierId||null},${name},${brand},${description},${Math.round(price)},${condition},${body.storage||null},${body.color||null},${stock},${sourcePrice===null?null:Math.round(sourcePrice)},${body.sourceLocation||null},${sourcePrice===null?null:Math.round(sourcePrice)},true,now()) RETURNING id,name,brand,description,price_kobo,condition_label,storage,color,stock_status,is_active,source_price_kobo,source_location,expected_cost_kobo,category_id,supplier_id,verified_at`;
    await recordAudit({actorUserId:adminId,action:'product.create',entityType:'product',entityId:rows[0].id,afterData:rows[0]});
    return json(res,201,{product:rows[0]});
  }
  if(req.method!=='PATCH') return json(res,405,{error:'Method not allowed'});
  const {productId,stockStatus,isActive,priceKobo,sourcePriceKobo,supplierId,sourceLocation}=req.body||{};
  if(typeof productId!=='string') return json(res,400,{error:'Product is required.'});
  if(stockStatus!=null&&(!stockStatuses.has(stockStatus))) return json(res,400,{error:'Invalid stock status.'});
  const before=await sql`SELECT id,name,price_kobo,source_price_kobo,stock_status,is_active,supplier_id,source_location FROM products WHERE id=${productId} LIMIT 1`;
  if(!before[0]) return json(res,404,{error:'Product not found.'});
  const numericPrice=priceKobo==null||priceKobo===''?null:Number(priceKobo);
  const numericSource=sourcePriceKobo==null||sourcePriceKobo===''?null:Number(sourcePriceKobo);
  if(numericPrice!==null&&(!Number.isFinite(numericPrice)||numericPrice<=0)) return json(res,400,{error:'Product price is invalid.'});
  if(numericSource!==null&&(!Number.isFinite(numericSource)||numericSource<0)) return json(res,400,{error:'Source price is invalid.'});
  const rows=await sql`UPDATE products SET stock_status=COALESCE(${typeof stockStatus==='string'?stockStatus:null},stock_status),is_active=COALESCE(${typeof isActive==='boolean'?isActive:null},is_active),price_kobo=COALESCE(${numericPrice===null?null:Math.round(numericPrice)},price_kobo),source_price_kobo=COALESCE(${numericSource===null?null:Math.round(numericSource)},source_price_kobo),expected_cost_kobo=COALESCE(${numericSource===null?null:Math.round(numericSource)},expected_cost_kobo),supplier_id=COALESCE(${supplierId||null},supplier_id),source_location=COALESCE(${sourceLocation||null},source_location),verified_at=now(),updated_at=now() WHERE id=${productId} RETURNING id,name,price_kobo,source_price_kobo,stock_status,is_active,supplier_id,source_location`;
  await recordAudit({actorUserId:adminId,action:'product.update',entityType:'product',entityId:productId,beforeData:before[0],afterData:rows[0]});
  return json(res,200,{product:rows[0]});
}

async function suppliers(req: VercelRequest,res: VercelResponse,adminId:string) {
  const permission = req.method === 'GET' ? 'suppliers.read' : (req.method === 'POST' ? 'suppliers.create' : 'suppliers.write');
  const admin = await requireAdminPermission(req, res, permission);
  if (!admin) return;
  
  if(req.method==='GET') return json(res,200,{suppliers:await sql`SELECT id,name,location,phone,notes,reliability_score,created_at,updated_at FROM suppliers ORDER BY updated_at DESC`});
  if(req.method==='POST') {
    const {name,location,phone,notes}=req.body||{};
    if(typeof name!=='string'||name.trim().length<2) return json(res,400,{error:'Supplier name is required.'});
    const rows=await sql`INSERT INTO suppliers(name,location,phone,notes) VALUES(${name.trim()},${location||null},${phone||null},${notes||''}) RETURNING id,name,location,phone,notes,reliability_score`;
    await recordAudit({actorUserId:adminId,action:'supplier.create',entityType:'supplier',entityId:rows[0].id,afterData:rows[0]});
    return json(res,201,{supplier:rows[0]});
  }
  if(req.method==='PATCH') {
    const {supplierId,name,location,phone,notes,reliabilityScore}=req.body||{};
    if(typeof supplierId!=='string') return json(res,400,{error:'Supplier is required.'});
    const before=await sql`SELECT id,name,location,phone,notes,reliability_score FROM suppliers WHERE id=${supplierId} LIMIT 1`;
    if(!before[0]) return json(res,404,{error:'Supplier not found.'});
    const score=reliabilityScore==null||reliabilityScore===''?null:Number(reliabilityScore);
    if(score!=null&&(!Number.isFinite(score)||score<0||score>5)) return json(res,400,{error:'Reliability score must be between 0 and 5.'});
    const rows=await sql`UPDATE suppliers SET name=COALESCE(${typeof name==='string'&&name.trim()?name.trim():null},name),location=${location===undefined?before[0].location:location||null},phone=${phone===undefined?before[0].phone:phone||null},notes=${notes===undefined?before[0].notes:notes||''},reliability_score=COALESCE(${score},reliability_score),updated_at=now() WHERE id=${supplierId} RETURNING id,name,location,phone,notes,reliability_score,updated_at`;
    await recordAudit({actorUserId:adminId,action:'supplier.update',entityType:'supplier',entityId:supplierId,beforeData:before[0],afterData:rows[0]});
    return json(res,200,{supplier:rows[0]});
  }
  return json(res,405,{error:'Method not allowed'});
}

async function orders(req: VercelRequest,res: VercelResponse,adminId:string) {
  const permission = req.method === 'GET' ? 'orders.read' : 'orders.write';
  const admin = await requireAdminPermission(req, res, permission);
  if (!admin) return;
  
  if(req.method==='GET') {
    const rows=await sql`SELECT o.id,o.order_number,o.quantity,o.total_kobo,o.status,o.payment_status,o.transfer_reference,o.payment_submitted_at,o.payment_verified_at,o.sourcing_status,o.delivery_name,o.delivery_phone,o.delivery_address,o.delivery_city,o.purchase_cost_kobo,o.delivery_fee_kobo,o.other_cost_kobo,o.actual_profit_kobo,o.created_at,p.name AS product_name,p.brand,s.name AS supplier_name,u.email AS buyer_email FROM orders o JOIN products p ON p.id=o.product_id LEFT JOIN suppliers s ON s.id=o.supplier_id JOIN users u ON u.id=o.buyer_id ORDER BY o.created_at DESC LIMIT 200`;
    return json(res,200,{orders:rows});
  }
  if(req.method!=='PATCH') return json(res,405,{error:'Method not allowed'});
  const {orderId,status,paymentStatus,sourcingStatus,supplierId,purchaseCostKobo,deliveryFeeKobo,otherCostKobo,version}=req.body||{};
  if(typeof orderId!=='string') return json(res,400,{error:'Order is required.'});
  if(status!=null&&!orderStatuses.has(status)) return json(res,400,{error:'Invalid order status.'});
  if(sourcingStatus!=null&&!sourcingStatuses.has(sourcingStatus)) return json(res,400,{error:'Invalid sourcing status.'});
  if(paymentStatus!=null&&!paymentStatuses.has(paymentStatus)) return json(res,400,{error:'Invalid payment status.'});
  const existing=await sql`SELECT o.id,o.order_number,o.total_kobo,o.payment_status,o.status,o.sourcing_status,o.supplier_id,o.purchase_cost_kobo,o.delivery_fee_kobo,o.other_cost_kobo,o.actual_profit_kobo,o.version,u.id AS buyer_id,u.name AS buyer_name,u.email AS buyer_email,p.name AS product_name FROM orders o JOIN users u ON u.id=o.buyer_id JOIN products p ON p.id=o.product_id WHERE o.id=${orderId} LIMIT 1`;
  if(!existing[0]) return json(res,404,{error:'Order not found.'});
  const purchase=purchaseCostKobo==null||purchaseCostKobo===''?null:Math.round(Number(purchaseCostKobo));
  const delivery=deliveryFeeKobo==null||deliveryFeeKobo===''?0:Math.round(Number(deliveryFeeKobo));
  const other=otherCostKobo==null||otherCostKobo===''?0:Math.round(Number(otherCostKobo));
  if(purchase!==null&&(!Number.isFinite(purchase)||purchase<0)) return json(res,400,{error:'Purchase cost is invalid.'});
  if(!Number.isFinite(delivery)||delivery<0||!Number.isFinite(other)||other<0) return json(res,400,{error:'Order costs are invalid.'});
  const actualProfit=purchase==null?null:Number(existing[0].total_kobo)-purchase-delivery-other;
  const nextPayment=paymentStatus||existing[0].payment_status;
  const nextStatus=status||(paymentStatus==='paid'?'confirmed':paymentStatus==='rejected'?'awaiting_payment':existing[0].status);
  const nextSourcing=sourcingStatus||existing[0].sourcing_status;

  if (nextPayment === 'paid' && existing[0].payment_status !== 'paid') {
    await sql`SELECT commit_order_inventory(${orderId}::uuid, ${adminId}::uuid)`;
  } else if ((nextPayment === 'rejected' || nextStatus === 'cancelled') && existing[0].status !== 'cancelled') {
    await sql`SELECT release_order_inventory(${orderId}::uuid, ${nextPayment === 'rejected' ? 'Payment rejected' : 'Order cancelled'}, ${adminId}::uuid)`;
  }

  // Update with optimistic locking: only update if version matches
  // If version not provided, allow update anyway (backward compatibility)
  const versionClause = typeof version === 'number' ? `AND version=${version}` : '';
  const updated=await sql`UPDATE orders SET status=${nextStatus},payment_status=${nextPayment},sourcing_status=${nextSourcing},supplier_id=COALESCE(${supplierId||null},supplier_id),purchase_cost_kobo=COALESCE(${purchase},purchase_cost_kobo),delivery_fee_kobo=${delivery},other_cost_kobo=${other},actual_profit_kobo=COALESCE(${actualProfit},actual_profit_kobo),purchased_at=CASE WHEN ${purchase} IS NOT NULL THEN COALESCE(purchased_at,now()) ELSE purchased_at END,paid_at=CASE WHEN ${nextPayment}='paid' THEN COALESCE(paid_at,now()) ELSE paid_at END,payment_verified_at=CASE WHEN ${nextPayment} IN ('paid','rejected') THEN now() ELSE payment_verified_at END,version=version+1,updated_at=now() WHERE id=${orderId} ${versionClause} RETURNING id,order_number,status,payment_status,sourcing_status,actual_profit_kobo,version`;
  
  // Check for version conflict
  if(!updated[0]) {
    const current=await sql`SELECT version FROM orders WHERE id=${orderId} LIMIT 1`;
    if(current[0]) {
      return json(res,409,{error:'Order was modified by another operation. Please refresh and try again.',currentVersion:current[0].version});
    }
    return json(res,404,{error:'Order not found.'});
  }
  
  const stateChanged=existing[0].payment_status!==nextPayment||existing[0].status!==nextStatus||existing[0].sourcing_status!==nextSourcing;
  const costsChanged=Number(existing[0].purchase_cost_kobo||0)!==Number((purchase??existing[0].purchase_cost_kobo)||0)||Number(existing[0].delivery_fee_kobo||0)!==delivery||Number(existing[0].other_cost_kobo||0)!==other||(supplierId&&supplierId!==existing[0].supplier_id);
  if(stateChanged||costsChanged) {
    await recordAudit({actorUserId:adminId,action:'order.update',entityType:'order',entityId:orderId,beforeData:existing[0],afterData:updated[0],metadata:{orderNumber:updated[0].order_number}});
    if(stateChanged) await recordOrderEvent({actorUserId:adminId,orderId,eventType:existing[0].payment_status!==updated[0].payment_status?`payment.${updated[0].payment_status}`:existing[0].sourcing_status!==updated[0].sourcing_status?`sourcing.${updated[0].sourcing_status}`:`order.${updated[0].status}`,fromStatus:existing[0].status,toStatus:updated[0].status,note:'Admin operational update',metadata:{paymentStatus:updated[0].payment_status,sourcingStatus:updated[0].sourcing_status}});
  }
  if(stateChanged) {
    let message=`Your order ${updated[0].order_number} is now ${String(nextStatus).replaceAll('_',' ')}.`;
    if(nextPayment==='paid') message=`Your payment for order ${updated[0].order_number} has been verified. We can now proceed with sourcing.`;
    if(nextPayment==='rejected') message=`We could not verify the payment for order ${updated[0].order_number}. Please check your transfer details and contact Vura support.`;
    const email=simpleOrderEmail(`Vura order ${updated[0].order_number} update`,existing[0].buyer_name,updated[0].order_number,message);
    await notifyUser({userId:existing[0].buyer_id,email:existing[0].buyer_email,firstName:existing[0].buyer_name,orderId:updated[0].id,eventType:`order.status.${nextStatus}`,title:nextPayment==='paid'?'Payment verified':'Order updated',body:message,subject:email.subject,text:email.text,html:email.html});
  }
  return json(res,200,{order:updated[0]});
}

// DELIVERY OPERATIONS
async function delivery(req: VercelRequest, res: VercelResponse, adminId: string) {
  const admin = await requireAdminPermission(req, res, req.method === 'GET' ? 'orders.read' : 'orders.write');
  if (!admin) return;

  const text = (value: unknown, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';

  if (req.method === 'GET') {
    const orderId = typeof req.query.orderId === 'string' ? req.query.orderId : null;
    const rows = orderId
      ? await sql`SELECT f.*, s.name AS supplier_name FROM order_fulfillments f LEFT JOIN suppliers s ON s.id=f.supplier_id WHERE f.order_id=${orderId} ORDER BY f.created_at DESC`
      : await sql`SELECT f.*, s.name AS supplier_name, o.order_number FROM order_fulfillments f LEFT JOIN suppliers s ON s.id=f.supplier_id JOIN orders o ON o.id=f.order_id ORDER BY f.created_at DESC LIMIT 500`;
    const ids = rows.map((r: any) => r.id);
    const events = ids.length ? await sql`SELECT * FROM delivery_events WHERE fulfillment_id = ANY(${ids}) ORDER BY created_at ASC` : [];
    return json(res, 200, { fulfillments: rows, events });
  }

  if (req.method !== 'POST' && req.method !== 'PATCH') return rejectUnsupportedMethod(res, ['GET', 'POST', 'PATCH']);
  const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};

  if (req.method === 'POST') {
    const orderId = text(body.orderId, 100);
    const address = text(body.deliveryAddress, 1000);
    if (!orderId) return json(res, 400, { error: 'Order is required.' });
    if (!address) return json(res, 400, { error: 'Delivery address is required.' });
    const rows = await sql`SELECT id, supplier_id, delivery_address, delivery_city FROM orders WHERE id=${orderId} LIMIT 1`;
    if (!rows[0]) return json(res, 404, { error: 'Order not found.' });
    const supplierId = text(body.supplierId, 100);
    const fulfillment = await sql`SELECT create_fulfillment(${orderId}, ${supplierId || rows[0].supplier_id || null}, ${text(body.courierName) || null}, ${text(body.trackingNumber) || null}, ${address}, ${text(body.deliveryCity, 200) || rows[0].delivery_city || null}) AS id`;
    const id = fulfillment[0].id;
    await recordAudit({ actorUserId: admin.id, action: 'fulfillment.create', entityType: 'fulfillment', entityId: id, afterData: { orderId, supplierId: supplierId || rows[0].supplier_id, courierName: text(body.courierName), trackingNumber: text(body.trackingNumber) } });
    await recordOrderEvent({ actorUserId: admin.id, orderId, eventType: 'fulfillment_created', toStatus: 'pending', metadata: { fulfillmentId: id } });
    return json(res, 201, { fulfillmentId: id });
  }

  const fulfillmentId = text(body.fulfillmentId, 100);
  const status = text(body.status, 50);
  if (!fulfillmentId) return json(res, 400, { error: 'Fulfillment is required.' });
  if (!fulfillmentStatuses.has(status)) return json(res, 400, { error: 'Invalid fulfillment status.' });
  const existing = await sql`SELECT id, order_id, status, tracking_number, courier_name FROM order_fulfillments WHERE id=${fulfillmentId} LIMIT 1`;
  if (!existing[0]) return json(res, 404, { error: 'Fulfillment not found.' });
  const event = await sql`SELECT update_fulfillment_status(${fulfillmentId}, ${status}, ${text(body.message) || `Fulfillment status changed to ${status}.`}, ${text(body.location, 200) || null}, 'admin', ${text(body.externalEventId, 200) || null}) AS id`;
  if (body.trackingNumber !== undefined || body.courierName !== undefined) {
    const tracking = text(body.trackingNumber, 200);
    const courier = text(body.courierName, 200);
    await sql`UPDATE order_fulfillments SET tracking_number=COALESCE(${tracking || null},tracking_number), courier_name=COALESCE(${courier || null},courier_name), updated_at=now() WHERE id=${fulfillmentId}`;
  }
  await recordAudit({ actorUserId: admin.id, action: 'fulfillment.status_update', entityType: 'fulfillment', entityId: fulfillmentId, beforeData: existing[0], afterData: { status, eventId: event[0]?.id || null } });
  await recordOrderEvent({ actorUserId: admin.id, orderId: existing[0].order_id, eventType: 'fulfillment_status_changed', toStatus: status, metadata: { fulfillmentId } });
  return json(res, 200, { fulfillmentId, eventId: event[0]?.id || null });
}

// FINANCE OPERATIONS
async function finance(req: VercelRequest, res: VercelResponse, adminId: string) {
  const admin = await requireAdminPermission(req, res, 'finance.read');
  if (!admin) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
  const [summary, monthly, payments, sourcing] = await Promise.all([
    sql`SELECT COUNT(*) FILTER (WHERE payment_status='paid')::int AS paid_orders, COUNT(*) FILTER (WHERE payment_status='pending_verification')::int AS pending_orders, COUNT(*) FILTER (WHERE payment_status='rejected')::int AS rejected_orders, COALESCE(SUM(total_kobo) FILTER (WHERE payment_status='paid'),0)::bigint AS revenue_kobo, COALESCE(SUM(purchase_cost_kobo) FILTER (WHERE payment_status='paid'),0)::bigint AS purchase_cost_kobo, COALESCE(SUM(delivery_fee_kobo) FILTER (WHERE payment_status='paid'),0)::bigint AS delivery_cost_kobo, COALESCE(SUM(other_cost_kobo) FILTER (WHERE payment_status='paid'),0)::bigint AS other_cost_kobo, COALESCE(SUM(actual_profit_kobo) FILTER (WHERE payment_status='paid'),0)::bigint AS profit_kobo FROM orders`,
    sql`SELECT to_char(date_trunc('month', created_at),'YYYY-MM') AS month, COUNT(*)::int AS orders, COALESCE(SUM(total_kobo) FILTER (WHERE payment_status='paid'),0)::bigint AS revenue_kobo, COALESCE(SUM(purchase_cost_kobo) FILTER (WHERE payment_status='paid'),0)::bigint AS purchase_cost_kobo, COALESCE(SUM(delivery_fee_kobo) FILTER (WHERE payment_status='paid'),0)::bigint AS delivery_cost_kobo, COALESCE(SUM(other_cost_kobo) FILTER (WHERE payment_status='paid'),0)::bigint AS other_cost_kobo, COALESCE(SUM(actual_profit_kobo) FILTER (WHERE payment_status='paid'),0)::bigint AS profit_kobo FROM orders WHERE created_at >= date_trunc('month', now()) - interval '11 months' GROUP BY 1 ORDER BY 1 DESC`,
    sql`SELECT payment_status, COUNT(*)::int AS orders, COALESCE(SUM(total_kobo),0)::bigint AS amount_kobo FROM orders GROUP BY payment_status ORDER BY payment_status`,
    sql`SELECT sourcing_status, COUNT(*)::int AS orders, COALESCE(SUM(total_kobo) FILTER (WHERE payment_status='paid'),0)::bigint AS paid_value_kobo FROM orders GROUP BY sourcing_status ORDER BY sourcing_status`,
  ]);
  return json(res, 200, { summary: summary[0], monthly, payments, sourcing });
}

// REFUND & RMA OPERATIONS
async function refunds(req: VercelRequest, res: VercelResponse, adminId: string) {
  const permission = req.method === 'GET' ? 'finance.read' : 'refunds.create';
  const admin = await requireAdminPermission(req, res, permission);
  if (!admin) return;

  if (req.method === 'GET') {
    const orderId = typeof req.query.orderId === 'string' ? req.query.orderId : null;
    const refunds = orderId
      ? await sql`SELECT r.*, o.order_number FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.order_id=${orderId} ORDER BY r.created_at DESC`
      : await sql`SELECT r.*, o.order_number FROM refunds r JOIN orders o ON o.id=r.order_id ORDER BY r.created_at DESC LIMIT 500`;
    const returns = orderId
      ? await sql`SELECT rr.*, o.order_number FROM return_requests rr JOIN orders o ON o.id=rr.order_id WHERE rr.order_id=${orderId} ORDER BY rr.created_at DESC`
      : await sql`SELECT rr.*, o.order_number FROM return_requests rr JOIN orders o ON o.id=rr.order_id ORDER BY rr.created_at DESC LIMIT 500`;
    return json(res, 200, { refunds, returns });
  }

  if (req.method !== 'POST' && req.method !== 'PATCH') return json(res, 405, { error: 'Method not allowed.' });
  const body = req.body || {};

  if (req.method === 'POST' && body.action === 'refund') {
    if (typeof body.orderId !== 'string' || typeof body.amountKobo !== 'number' || !Number.isSafeInteger(body.amountKobo) || body.amountKobo <= 0) return json(res, 400, { error: 'Order and a positive whole-kobo refund amount are required.' });
    const order = await sql`SELECT id, order_number, total_kobo FROM orders WHERE id=${body.orderId} LIMIT 1`;
    if (!order[0]) return json(res, 404, { error: 'Order not found.' });
    const already = await sql`SELECT COALESCE(SUM(amount_kobo),0)::bigint AS amount FROM refunds WHERE order_id=${body.orderId} AND status IN ('requested','approved','processing','completed')`;
    const remaining = Number(order[0].total_kobo) - Number(already[0]?.amount || 0);
    if (body.amountKobo > remaining) return json(res, 409, { error: `Refund exceeds the remaining refundable amount (${remaining} kobo).` });
    const key = typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim() ? body.idempotencyKey.trim() : `refund:${body.orderId}:${body.amountKobo}:${body.reason || 'unspecified'}`;
    const rows = await sql`INSERT INTO refunds(order_id,amount_kobo,reason,status,idempotency_key,requested_by) VALUES(${body.orderId},${body.amountKobo},${typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'Customer refund'},'requested',${key},${admin.id}) ON CONFLICT(idempotency_key) DO NOTHING RETURNING id, order_id, amount_kobo, status, idempotency_key, created_at`;
    if (!rows[0]) {
      const existing = await sql`SELECT id, order_id, amount_kobo, status, idempotency_key, created_at FROM refunds WHERE idempotency_key=${key} LIMIT 1`;
      return json(res, 200, { refund: existing[0], idempotent: true });
    }
    await recordAudit({ actorUserId: admin.id, action: 'refund.requested', entityType: 'refund', entityId: rows[0].id, afterData: rows[0] });
    await recordOrderEvent({ actorUserId: admin.id, orderId: body.orderId, eventType: 'refund_requested', metadata: { refundId: rows[0].id, amountKobo: body.amountKobo } });
    return json(res, 201, { refund: rows[0] });
  }

  if (req.method === 'POST' && body.action === 'rma') {
    if (typeof body.orderId !== 'string' || typeof body.reason !== 'string' || !body.reason.trim()) return json(res, 400, { error: 'Order and return reason are required.' });
    const rma = `RMA-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
    const rows = await sql`INSERT INTO return_requests(rma_number,order_id,fulfillment_id,reason,customer_note,status) VALUES(${rma},${body.orderId},${typeof body.fulfillmentId === 'string' ? body.fulfillmentId : null},${body.reason.trim()},${typeof body.customerNote === 'string' ? body.customerNote.trim() : ''},'requested') RETURNING *`;
    await recordAudit({ actorUserId: admin.id, action: 'rma.created', entityType: 'rma', entityId: rows[0].id, afterData: rows[0] });
    await recordOrderEvent({ actorUserId: admin.id, orderId: body.orderId, eventType: 'rma_created', metadata: { rmaId: rows[0].id, rmaNumber: rma } });
    return json(res, 201, { rma: rows[0] });
  }

  if (req.method === 'PATCH' && body.action === 'refund_approve') {
    if (typeof body.refundId !== 'string') return json(res, 400, { error: 'Refund is required.' });
    const existing = await sql`SELECT id, order_id, amount_kobo, status FROM refunds WHERE id=${body.refundId} LIMIT 1`;
    if (!existing[0]) return json(res, 404, { error: 'Refund not found.' });
    if (existing[0].status !== 'requested') return json(res, 409, { error: `Refund cannot be approved from ${existing[0].status} status.` });
    const updated = await sql`UPDATE refunds SET status='approved', approved_at=now(), approved_by=${admin.id}, updated_at=now() WHERE id=${body.refundId} RETURNING *`;
    await recordAudit({ actorUserId: admin.id, action: 'refund.approved', entityType: 'refund', entityId: body.refundId, beforeData: existing[0], afterData: updated[0] });
    await recordOrderEvent({ actorUserId: admin.id, orderId: existing[0].order_id, eventType: 'refund_approved', metadata: { refundId: body.refundId, amountKobo: existing[0].amount_kobo } });
    return json(res, 200, { refund: updated[0] });
  }

  if (req.method === 'PATCH' && body.action === 'rma_approve') {
    if (typeof body.rmaId !== 'string') return json(res, 400, { error: 'RMA is required.' });
    const existing = await sql`SELECT id, order_id, status FROM return_requests WHERE id=${body.rmaId} LIMIT 1`;
    if (!existing[0]) return json(res, 404, { error: 'RMA not found.' });
    if (existing[0].status !== 'requested') return json(res, 409, { error: `RMA cannot be approved from ${existing[0].status} status.` });
    const updated = await sql`UPDATE return_requests SET status='approved', approved_at=now(), approved_by=${admin.id}, updated_at=now() WHERE id=${body.rmaId} RETURNING *`;
    await recordAudit({ actorUserId: admin.id, action: 'rma.approved', entityType: 'rma', entityId: body.rmaId, beforeData: existing[0], afterData: updated[0] });
    await recordOrderEvent({ actorUserId: admin.id, orderId: existing[0].order_id, eventType: 'rma_approved', metadata: { rmaId: body.rmaId } });
    return json(res, 200, { rma: updated[0] });
  }

  return json(res, 400, { error: 'Invalid refund operation.' });
}
