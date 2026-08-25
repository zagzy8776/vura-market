import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from './_lib/db.js';
import { requireAdmin } from './_lib/auth.js';
import { recordAudit, recordOrderEvent } from './_lib/audit.js';
import { simpleOrderEmail } from './_lib/email.js';
import { notifyUser } from './_lib/notifications.js';

const orderStatuses = new Set(['awaiting_payment','payment_verification','confirmed','sourcing','purchased','out_for_delivery','delivered','cancelled']);
const sourcingStatuses = new Set(['awaiting_confirmation','confirmed','sourcing','purchased','out_for_delivery','delivered','cancelled']);
const paymentStatuses = new Set(['unpaid','pending_verification','paid','rejected']);

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
type Dispatcher = (req: VercelRequest, res: VercelResponse, adminId: string) => Promise<void> | void;

const handlers: Record<string, Partial<Record<Method, Dispatcher>>> = {
  overview: { GET: (_req, res) => overview(res) },
  orders: { GET: orders, PATCH: orders },
  products: { GET: products, PATCH: products },
  suppliers: { GET: suppliers, POST: suppliers, PATCH: suppliers },
  customers: { GET: (_req, res) => customers(res) },
  notifications: { GET: (_req, res) => notifications(res) },
};

function resource(req: VercelRequest) {
  const value = req.query.resource;
  if (Array.isArray(value)) return value[0];
  return value || '';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
  } catch {
    return json(res, 500, { error: 'The admin operation could not be completed.' });
  }
}

async function overview(res: VercelResponse) {
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

async function customers(res: VercelResponse) {
  const rows = await sql`SELECT u.id,u.name,u.email,u.role,u.created_at,COUNT(o.id)::int AS order_count,COALESCE(SUM(o.total_kobo),0)::bigint AS total_spend_kobo FROM users u LEFT JOIN orders o ON o.buyer_id=u.id WHERE u.role='customer' GROUP BY u.id ORDER BY total_spend_kobo DESC LIMIT 500`;
  return json(res,200,{customers:rows});
}

async function notifications(res: VercelResponse) {
  const rows = await sql`SELECT n.id,n.user_id,n.order_id,n.type,n.title,n.body,n.created_at,u.email AS user_email,o.order_number FROM notifications n LEFT JOIN users u ON u.id=n.user_id LEFT JOIN orders o ON o.id=n.order_id ORDER BY n.created_at DESC LIMIT 200`;
  return json(res,200,{notifications:rows});
}

async function products(req: VercelRequest,res: VercelResponse,adminId:string) {
  if (req.method==='GET') {
    const rows=await sql`SELECT p.id,p.name,p.brand,p.price_kobo,p.condition_label,p.storage,p.color,p.stock_status,p.is_active,p.source_price_kobo,p.source_location,p.expected_cost_kobo,p.verified_at,s.name AS supplier_name,c.name AS category,ARRAY_AGG(pi.image_url ORDER BY pi.sort_order) FILTER (WHERE pi.image_url IS NOT NULL) AS images FROM products p LEFT JOIN suppliers s ON s.id=p.supplier_id LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN product_images pi ON pi.product_id=p.id GROUP BY p.id,s.name,c.name ORDER BY p.created_at DESC LIMIT 500`;
    return json(res,200,{products:rows});
  }
  if(req.method!=='PATCH') return json(res,405,{error:'Method not allowed'});
  const {productId,stockStatus,isActive,priceKobo,sourcePriceKobo,supplierId,sourceLocation}=req.body||{};
  if(typeof productId!=='string') return json(res,400,{error:'Product is required.'});
  const before=await sql`SELECT id,name,price_kobo,source_price_kobo,stock_status,is_active,supplier_id,source_location FROM products WHERE id=${productId} LIMIT 1`;
  if(!before[0]) return json(res,404,{error:'Product not found.'});
  const rows=await sql`UPDATE products SET stock_status=COALESCE(${typeof stockStatus==='string'?stockStatus:null},stock_status),is_active=COALESCE(${typeof isActive==='boolean'?isActive:null},is_active),price_kobo=COALESCE(${Number.isFinite(Number(priceKobo))?Math.round(Number(priceKobo)):null},price_kobo),source_price_kobo=COALESCE(${Number.isFinite(Number(sourcePriceKobo))?Math.round(Number(sourcePriceKobo)):null},source_price_kobo),expected_cost_kobo=COALESCE(${Number.isFinite(Number(sourcePriceKobo))?Math.round(Number(sourcePriceKobo)):null},expected_cost_kobo),supplier_id=COALESCE(${supplierId||null},supplier_id),source_location=COALESCE(${sourceLocation||null},source_location),verified_at=now(),updated_at=now() WHERE id=${productId} RETURNING id,name,price_kobo,source_price_kobo,stock_status,is_active,supplier_id,source_location`;
  await recordAudit({actorUserId:adminId,action:'product.update',entityType:'product',entityId:productId,beforeData:before[0],afterData:rows[0]});
  return json(res,200,{product:rows[0]});
}

async function suppliers(req: VercelRequest,res: VercelResponse,adminId:string) {
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
  if(req.method==='GET') {
    const rows=await sql`SELECT o.id,o.order_number,o.quantity,o.total_kobo,o.status,o.payment_status,o.transfer_reference,o.payment_submitted_at,o.payment_verified_at,o.sourcing_status,o.delivery_name,o.delivery_phone,o.delivery_address,o.delivery_city,o.purchase_cost_kobo,o.delivery_fee_kobo,o.other_cost_kobo,o.actual_profit_kobo,o.created_at,p.name AS product_name,p.brand,s.name AS supplier_name,u.email AS buyer_email FROM orders o JOIN products p ON p.id=o.product_id LEFT JOIN suppliers s ON s.id=o.supplier_id JOIN users u ON u.id=o.buyer_id ORDER BY o.created_at DESC LIMIT 200`;
    return json(res,200,{orders:rows});
  }
  if(req.method!=='PATCH') return json(res,405,{error:'Method not allowed'});
  const {orderId,status,paymentStatus,sourcingStatus,supplierId,purchaseCostKobo,deliveryFeeKobo,otherCostKobo}=req.body||{};
  if(typeof orderId!=='string') return json(res,400,{error:'Order is required.'});
  if(status!=null&&!orderStatuses.has(status)) return json(res,400,{error:'Invalid order status.'});
  if(sourcingStatus!=null&&!sourcingStatuses.has(sourcingStatus)) return json(res,400,{error:'Invalid sourcing status.'});
  if(paymentStatus!=null&&!paymentStatuses.has(paymentStatus)) return json(res,400,{error:'Invalid payment status.'});
  const existing=await sql`SELECT o.id,o.order_number,o.total_kobo,o.payment_status,o.status,o.sourcing_status,o.supplier_id,o.purchase_cost_kobo,o.delivery_fee_kobo,o.other_cost_kobo,o.actual_profit_kobo,u.id AS buyer_id,u.name AS buyer_name,u.email AS buyer_email,p.name AS product_name FROM orders o JOIN users u ON u.id=o.buyer_id JOIN products p ON p.id=o.product_id WHERE o.id=${orderId} LIMIT 1`;
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
  const updated=await sql`UPDATE orders SET status=${nextStatus},payment_status=${nextPayment},sourcing_status=${nextSourcing},supplier_id=COALESCE(${supplierId||null},supplier_id),purchase_cost_kobo=COALESCE(${purchase},purchase_cost_kobo),delivery_fee_kobo=${delivery},other_cost_kobo=${other},actual_profit_kobo=COALESCE(${actualProfit},actual_profit_kobo),purchased_at=CASE WHEN ${purchase} IS NOT NULL THEN COALESCE(purchased_at,now()) ELSE purchased_at END,paid_at=CASE WHEN ${nextPayment}='paid' THEN COALESCE(paid_at,now()) ELSE paid_at END,payment_verified_at=CASE WHEN ${nextPayment} IN ('paid','rejected') THEN now() ELSE payment_verified_at END,updated_at=now() WHERE id=${orderId} RETURNING id,order_number,status,payment_status,sourcing_status,actual_profit_kobo`;
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
