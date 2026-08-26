# Testing Strategy for Critical Issues Fix

Comprehensive testing plan to validate all 5 critical issues are properly fixed.

---

## Issue 1: Permission Checks - Testing

### Unit Tests

**File:** `tests/admin-permissions.handlers.test.ts`

```typescript
describe('Admin Permissions', () => {
  describe('overview endpoint', () => {
    test('allows user with dashboard.read permission', async () => {
      const admin = await createAdminWithPermission('dashboard.read');
      const res = await handler(
        createRequest('GET', 'admin?resource=overview', admin),
        new VercelResponse()
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.liveProducts).toBeDefined();
    });

    test('denies user without dashboard.read permission', async () => {
      const admin = await createAdminWithoutPermission('dashboard.read');
      const res = await handler(
        createRequest('GET', 'admin?resource=overview', admin),
        new VercelResponse()
      );
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toContain('permission');
    });

    test('denies unauthenticated users', async () => {
      const res = await handler(
        createRequest('GET', 'admin?resource=overview', null),
        new VercelResponse()
      );
      expect(res.statusCode).toBe(401);
    });
  });

  describe('products endpoint', () => {
    test('GET requires products.read permission', async () => {
      // Test matrix: with/without permission, with/without admin role
    });

    test('POST requires products.create permission', async () => {
      // Test matrix
    });

    test('PATCH requires products.write permission', async () => {
      // Test matrix
    });
  });

  describe('suppliers endpoint', () => {
    test('GET requires suppliers.read permission', async () => {});
    test('POST requires suppliers.create permission', async () => {});
    test('PATCH requires suppliers.write permission', async () => {});
  });

  describe('orders endpoint', () => {
    test('GET requires orders.read permission', async () => {});
    test('PATCH requires orders.write permission', async () => {});
  });

  describe('refunds endpoint', () => {
    test('GET requires finance.read permission', async () => {});
    test('POST/PATCH refund operations require refunds.create permission', async () => {});
  });

  describe('permission inheritance', () => {
    test('owner role has all permissions', async () => {
      const owner = await createAdminWithRole('owner');
      for (const permission of allPermissions) {
        expect(await hasPermission(owner, permission)).toBe(true);
      }
    });

    test('manager role has operational permissions but not finance', async () => {
      const manager = await createAdminWithRole('manager');
      expect(await hasPermission(manager, 'orders.write')).toBe(true);
      expect(await hasPermission(manager, 'finance.read')).toBe(false);
    });

    test('viewer role has read-only permissions', async () => {
      const viewer = await createAdminWithRole('viewer');
      expect(await hasPermission(viewer, 'dashboard.read')).toBe(true);
      expect(await hasPermission(viewer, 'products.create')).toBe(false);
    });
  });
});
```

### Integration Tests

**File:** `tests/admin-api.integration.test.ts`

```typescript
describe('Admin API - Permission Integration', () => {
  let mockDb: MockDatabase;
  let handlers: AdminHandlers;

  beforeEach(() => {
    mockDb = new MockDatabase();
    handlers = new AdminHandlers(mockDb);
  });

  test('full flow: user without permission gets 403 at every step', async () => {
    const limitedUser = await mockDb.createUser({
      role: 'admin',
      permissions: [] // No permissions
    });

    const endpoints = [
      { method: 'GET', resource: 'overview' },
      { method: 'GET', resource: 'products' },
      { method: 'GET', resource: 'orders' },
      { method: 'GET', resource: 'suppliers' },
    ];

    for (const { method, resource } of endpoints) {
      const req = createRequest(method, `admin?resource=${resource}`, limitedUser);
      const res = await handlers[resource](req, new VercelResponse(), limitedUser.id);
      expect(res.statusCode).toBe(403);
    }
  });

  test('audit log records permission checks', async () => {
    const user = await mockDb.createUser({ role: 'admin', permissions: ['dashboard.read'] });
    const req = createRequest('GET', 'admin?resource=overview', user);
    
    await handlers.overview(req, new VercelResponse(), user.id);
    
    const auditLog = await mockDb.queryAudit();
    // Should log permission check
    expect(auditLog).toContainEqual(
      expect.objectContaining({
        action: 'permission_check',
        metadata: { permission: 'dashboard.read', result: 'allowed' }
      })
    );
  });
});
```

### E2E Tests

**Scenario:** Admin workflow with different roles

```typescript
describe('E2E: Admin Permission Flows', () => {
  test('owner can do everything', async () => {
    const owner = await loginAsAdmin(ownerCredentials);
    
    // Can view dashboard
    expect(await owner.getOverview()).toHaveProperty('liveProducts');
    
    // Can view products
    expect(await owner.getProducts()).toBeInstanceOf(Array);
    
    // Can create product
    expect(await owner.createProduct({...})).toHaveProperty('id');
    
    // Can view finance
    expect(await owner.getFinance()).toHaveProperty('summary');
    
    // Can process refund
    expect(await owner.completeRefund(refundId)).toHaveProperty('status', 'completed');
  });

  test('manager can do operational tasks but not finance', async () => {
    const manager = await loginAsAdmin(managerCredentials);
    
    // Can view orders
    expect(await manager.getOrders()).toBeInstanceOf(Array);
    
    // Can update order status
    expect(await manager.updateOrder(orderId, { status: 'confirmed' }))
      .toHaveProperty('status', 'confirmed');
    
    // Cannot view finance
    expect(await manager.getFinance()).rejects.toHaveProperty('statusCode', 403);
    
    // Cannot complete refund
    expect(await manager.completeRefund(refundId))
      .rejects.toHaveProperty('statusCode', 403);
  });

  test('viewer can only read', async () => {
    const viewer = await loginAsAdmin(viewerCredentials);
    
    // Can view orders
    expect(await viewer.getOrders()).toBeInstanceOf(Array);
    
    // Cannot update orders
    expect(await viewer.updateOrder(orderId, { status: 'confirmed' }))
      .rejects.toHaveProperty('statusCode', 403);
  });
});
```

---

## Issue 2: Concurrent Edit Protection - Testing

### Unit Tests

**File:** `tests/order-versioning.handlers.test.ts`

```typescript
describe('Order Versioning (Optimistic Locking)', () => {
  describe('version tracking', () => {
    test('version starts at 1', async () => {
      const order = await createOrder();
      expect(order.version).toBe(1);
    });

    test('version increments on successful update', async () => {
      const order = await createOrder();
      const updated = await updateOrder(order.id, { status: 'confirmed' });
      expect(updated.version).toBe(2);
    });

    test('version not incremented on failed update', async () => {
      const order = await createOrder();
      await updateOrder(order.id, { status: 'confirmed' }, { version: 999 })
        .catch(() => {}); // Expected to fail
      const current = await getOrder(order.id);
      expect(current.version).toBe(1); // Unchanged
    });
  });

  describe('conflict detection', () => {
    test('returns 409 when version does not match', async () => {
      const order = await createOrder();
      
      const res = await updateOrder(
        order.id,
        { status: 'confirmed' },
        { version: 999 } // Wrong version
      );
      
      expect(res.statusCode).toBe(409);
      expect(res.body.error).toContain('modified');
      expect(res.body.currentVersion).toBe(1);
    });

    test('succeeds when version matches', async () => {
      const order = await createOrder(); // v1
      
      const res = await updateOrder(
        order.id,
        { status: 'confirmed' },
        { version: 1 } // Correct version
      );
      
      expect(res.statusCode).toBe(200);
      expect(res.body.order.version).toBe(2);
    });

    test('is idempotent on version match', async () => {
      const order = await createOrder(); // v1
      
      const res1 = await updateOrder(
        order.id,
        { status: 'confirmed' },
        { version: 1 }
      );
      expect(res1.body.order.version).toBe(2);
      
      // Same version (1) again - should fail
      const res2 = await updateOrder(
        order.id,
        { status: 'confirmed' },
        { version: 1 }
      );
      expect(res2.statusCode).toBe(409);
    });
  });

  describe('concurrent updates', () => {
    test('simultaneous updates: first wins, second gets 409', async () => {
      const order = await createOrder(); // v1
      
      const update1 = updateOrder(
        order.id,
        { paymentStatus: 'paid' },
        { version: 1 }
      );
      const update2 = updateOrder(
        order.id,
        { status: 'confirmed' },
        { version: 1 }
      );
      
      const [res1, res2] = await Promise.all([update1, update2]);
      
      // One succeeds (version 2), one fails
      expect(
        (res1.statusCode === 200 && res2.statusCode === 409) ||
        (res1.statusCode === 409 && res2.statusCode === 200)
      ).toBe(true);
      
      // Final version is 2
      const final = await getOrder(order.id);
      expect(final.version).toBe(2);
    });

    test('multiple sequential updates increment version', async () => {
      let order = await createOrder(); // v1
      
      for (let i = 0; i < 5; i++) {
        order = await updateOrder(
          order.id,
          { deliveryFeeKobo: 1000 * (i + 1) },
          { version: order.version }
        ).then(r => r.body.order);
        
        expect(order.version).toBe(i + 2);
      }
      
      expect(order.version).toBe(6);
    });
  });

  describe('backward compatibility', () => {
    test('update without version still works (implicit current version)', async () => {
      const order = await createOrder();
      
      // Old code doesn't send version
      const res = await updateOrder(order.id, { status: 'confirmed' });
      
      expect(res.statusCode).toBe(200);
      expect(res.body.order.version).toBe(2);
    });

    test('update with null version skips check', async () => {
      const order = await createOrder();
      
      const res = await updateOrder(
        order.id,
        { status: 'confirmed' },
        { version: null }
      );
      
      expect(res.statusCode).toBe(200);
    });
  });

  describe('fulfillment versioning', () => {
    test('fulfillment version increments independently', async () => {
      const fulfillment = await createFulfillment();
      expect(fulfillment.version).toBe(1);
      
      const updated = await updateFulfillment(fulfillment.id, { status: 'dispatched' });
      expect(updated.version).toBe(2);
    });

    test('concurrent fulfillment updates protected', async () => {
      const fulfillment = await createFulfillment();
      
      const res1 = updateFulfillment(
        fulfillment.id,
        { status: 'dispatched' },
        { version: 1 }
      );
      const res2 = updateFulfillment(
        fulfillment.id,
        { trackingNumber: 'TRACK123' },
        { version: 1 }
      );
      
      const [result1, result2] = await Promise.all([res1, res2]);
      expect(result1.statusCode).not.toBe(result2.statusCode); // One succeeds, one fails
    });
  });
});
```

### Integration Tests

**File:** `tests/order-versioning.integration.test.ts`

```typescript
describe('Order Versioning - Integration', () => {
  test('webhook updating order conflicts with admin update', async () => {
    const order = await createOrder();
    const admin = await createAdmin();
    
    // Simulate: Admin starts update, webhook fires, admin completes update
    const startTime = Date.now();
    
    // Admin reads order (v1)
    const orderView = await admin.getOrder(order.id);
    expect(orderView.version).toBe(1);
    
    // Webhook delivers fulfillment status update (order v1 → v2)
    await simulateWebhook('delivery_status_updated', {
      orderId: order.id,
      status: 'in_transit'
    });
    
    const orderAfterWebhook = await getOrder(order.id);
    expect(orderAfterWebhook.version).toBe(2);
    
    // Admin tries to update with old version (1)
    const adminUpdate = await admin.updateOrder(
      order.id,
      { paymentStatus: 'paid' },
      { version: 1 }
    ).catch(err => err.response);
    
    expect(adminUpdate.statusCode).toBe(409);
    expect(adminUpdate.body.currentVersion).toBe(2);
    
    const duration = Date.now() - startTime;
    console.log(`Conflict detected in ${duration}ms`);
  });

  test('monitoring detects version conflicts', async () => {
    let conflictCount = 0;
    let successCount = 0;
    
    // Simulate high concurrency
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(
        updateOrder(
          testOrder.id,
          { deliveryFeeKobo: 1000 * (i + 1) },
          { version: testOrder.version }
        )
          .then(() => { successCount++; })
          .catch((err) => {
            if (err.statusCode === 409) conflictCount++;
          })
      );
    }
    
    await Promise.allSettled(promises);
    
    console.log(`Successes: ${successCount}, Conflicts: ${conflictCount}`);
    expect(successCount + conflictCount).toBe(20);
    expect(conflictCount).toBeGreaterThan(0); // Should have some conflicts
  });
});
```

### E2E Tests

**Scenario:** User opens order details, submits change while webhook updates same order

---

## Issue 3: Refund Processing - Testing

### Unit Tests

**File:** `tests/refund-processing.handlers.test.ts`

```typescript
describe('Refund Processing', () => {
  describe('complete_refund flow', () => {
    test('transitions refund from approved to completed', async () => {
      const refund = await createRefund({ status: 'approved' });
      
      const completed = await completeRefund(refund.id);
      
      expect(completed.status).toBe('completed');
      expect(completed.completedAt).toBeDefined();
    });

    test('creates ledger entries on completion', async () => {
      const refund = await createRefund({ status: 'approved', amountKobo: 50000 });
      const order = await getOrder(refund.orderId);
      
      await completeRefund(refund.id);
      
      const entries = await getLedgerEntries({
        reference: `refund:${refund.id}`
      });
      
      // Should have two entries: clearing (debit) and payable (credit)
      expect(entries).toHaveLength(2);
      
      const clearing = entries.find(e => e.entryType === 'refund_clearing');
      const payable = entries.find(e => e.entryType === 'refund_payable');
      
      expect(clearing.amountKobo).toBe(-50000); // Debit
      expect(payable.amountKobo).toBe(50000);   // Credit
    });

    test('updates payment transaction status to refunded', async () => {
      const refund = await createRefund({ status: 'approved' });
      const paymentTx = await getPaymentTransaction(refund.paymentTransactionId);
      expect(paymentTx.status).toBe('confirmed');
      
      await completeRefund(refund.id);
      
      const updated = await getPaymentTransaction(refund.paymentTransactionId);
      expect(updated.status).toMatch(/refunded|partially_refunded/);
    });

    test('cannot complete already-completed refund', async () => {
      const refund = await createRefund({ status: 'approved' });
      
      await completeRefund(refund.id); // First time succeeds
      
      // Second time should fail gracefully (idempotent)
      const result = await completeRefund(refund.id).catch(err => err);
      expect(result.message).toContain('REFUND_NOT_COMPLETED');
    });

    test('cannot complete non-approved refund', async () => {
      const refund = await createRefund({ status: 'requested' });
      
      const result = await completeRefund(refund.id).catch(err => err);
      expect(result.message).toContain('REFUND_INVALID_STATUS');
    });

    test('ledger posting is atomic', async () => {
      const refund = await createRefund({ status: 'approved' });
      
      // Simulate failure in ledger posting
      mockDb.simulateError('ledger_entries', 'INSERT', 'Constraint violation');
      
      const result = await completeRefund(refund.id).catch(err => err);
      
      // Refund should NOT be completed if ledger fails
      const current = await getRefund(refund.id);
      expect(current.status).not.toBe('completed');
    });
  });

  describe('fail_refund flow', () => {
    test('transitions refund to failed with reason', async () => {
      const refund = await createRefund({ status: 'approved' });
      
      const failed = await failRefund(refund.id, 'Customer requested cancellation');
      
      expect(failed.status).toBe('failed');
      expect(failed.failureReason).toBe('Customer requested cancellation');
      expect(failed.failedAt).toBeDefined();
    });

    test('no ledger entries posted for failed refund', async () => {
      const refund = await createRefund({ status: 'approved' });
      
      await failRefund(refund.id, 'Invalid request');
      
      const entries = await getLedgerEntries({
        reference: `refund:${refund.id}`
      });
      
      expect(entries).toHaveLength(0);
    });
  });

  describe('API endpoint', () => {
    test('POST /admin?resource=refunds&action=refund_process completes refund', async () => {
      const refund = await createRefund({ status: 'approved' });
      const admin = await createAdminWithPermission('refunds.create');
      
      const res = await callAdminAPI(admin, 'PATCH', 'refunds', {
        action: 'refund_process',
        refundId: refund.id
      });
      
      expect(res.statusCode).toBe(200);
      expect(res.body.refund.status).toBe('completed');
    });

    test('processing refund sends customer notification', async () => {
      const refund = await createRefund({ status: 'approved' });
      const order = await getOrder(refund.orderId);
      const customer = await getUser(order.buyerId);
      
      const notificationsSpy = jest.spyOn(notifications, 'send');
      
      await completeRefund(refund.id);
      
      expect(notificationsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: customer.id,
          eventType: 'refund.completed',
          title: expect.stringContaining('Refund')
        })
      );
    });

    test('requires refunds.create permission', async () => {
      const refund = await createRefund({ status: 'approved' });
      const limitedUser = await createAdminWithoutPermission('refunds.create');
      
      const res = await callAdminAPI(limitedUser, 'PATCH', 'refunds', {
        action: 'refund_process',
        refundId: refund.id
      }).catch(err => err.response);
      
      expect(res.statusCode).toBe(403);
    });
  });
});
```

### Integration Tests

**File:** `tests/refund-processing.integration.test.ts`

```typescript
describe('Refund Processing - End-to-End', () => {
  test('complete refund workflow with notifications', async () => {
    // Setup: Create order, payment, refund
    const customer = await createCustomer();
    const product = await createProduct();
    const order = await createOrder({
      buyerId: customer.id,
      productId: product.id,
      totalKobo: 100000
    });
    const payment = await confirmOrderPayment(order.id, 100000);
    const refund = await requestRefund(order.id, 50000); // 50% refund
    
    // Approve refund (admin action)
    const admin = await createAdmin();
    const approved = await admin.approveRefund(refund.id);
    expect(approved.status).toBe('approved');
    
    // Process refund (admin action)
    const completed = await admin.completeRefund(refund.id);
    expect(completed.status).toBe('completed');
    
    // Verify ledger entries
    const entries = await getLedgerEntries({ orderId: order.id });
    const refundEntries = entries.filter(e => e.reference.startsWith('refund:'));
    expect(refundEntries).toHaveLength(2);
    expect(refundEntries[0].amountKobo + refundEntries[1].amountKobo).toBe(0); // Balanced
    
    // Verify customer was notified
    const notifications = await getCustomerNotifications(customer.id);
    expect(notifications).toContainEqual(
      expect.objectContaining({
        eventType: 'refund.completed',
        type: 'refund_processed'
      })
    );
    
    // Verify email was sent
    const emails = await getEmailsTo(customer.email);
    expect(emails).toContainEqual(
      expect.objectContaining({
        subject: expect.stringContaining('Refund'),
        body: expect.stringContaining(customer.name)
      })
    );
  });

  test('partial refunds: multiple refunds from single order', async () => {
    const order = await createOrder({ totalKobo: 100000 });
    
    // Create 3 partial refunds totaling 100%
    const refund1 = await requestRefund(order.id, 25000); // 25%
    const refund2 = await requestRefund(order.id, 40000); // 40%
    const refund3 = await requestRefund(order.id, 35000); // 35%
    
    // Approve and complete all
    for (const ref of [refund1, refund2, refund3]) {
      await approveRefund(ref.id);
      await completeRefund(ref.id);
    }
    
    // Verify ledger shows all three
    const entries = await getLedgerEntries({ orderId: order.id });
    expect(entries.filter(e => e.reference.startsWith('refund:'))).toHaveLength(6); // 2 per refund
    
    // Verify payment transaction marked as fully refunded
    const payment = await getPaymentTransaction(order.paymentTransactionId);
    expect(payment.status).toBe('refunded');
    expect(payment.refundedAmount).toBe(100000);
  });
});
```

---

## Issue 4: RMA Workflow - Testing

### Unit Tests

**File:** `tests/rma-workflow.handlers.test.ts`

```typescript
describe('RMA Workflow', () => {
  describe('mark_rma_received', () => {
    test('transitions RMA from return_in_transit to received', async () => {
      const rma = await createRMA({ status: 'approved' });
      
      const received = await markRMAReceived(rma.id);
      
      expect(received.status).toBe('received');
      expect(received.receivedAt).toBeDefined();
    });

    test('records event in rma_events table', async () => {
      const rma = await createRMA({ status: 'approved' });
      
      await markRMAReceived(rma.id);
      
      const event = await getRMAEvent(rma.id, 'received');
      expect(event).toBeDefined();
      expect(event.fromStatus).toBe('approved');
      expect(event.toStatus).toBe('received');
    });
  });

  describe('start_rma_inspection', () => {
    test('transitions RMA from received to inspecting', async () => {
      const rma = await createRMA({ status: 'received' });
      
      const inspecting = await startRMAInspection(rma.id);
      
      expect(inspecting.status).toBe('inspecting');
      expect(inspecting.inspectionStartedAt).toBeDefined();
    });

    test('cannot inspect if not received', async () => {
      const rma = await createRMA({ status: 'approved' }); // Not received
      
      const result = await startRMAInspection(rma.id).catch(err => err);
      expect(result.message).toContain('INVALID_STATUS');
    });
  });

  describe('complete_rma_with_outcome - refund decision', () => {
    test('creates and completes refund', async () => {
      const rma = await createRMA({ status: 'inspecting' });
      const order = await getOrder(rma.orderId);
      
      const result = await completeRMAWithOutcome(rma.id, 'refund', 'Product defective');
      
      expect(result.status).toBe('refunded');
      
      // Verify refund was created and completed
      const refund = await getRefundForRMA(rma.id);
      expect(refund).toBeDefined();
      expect(refund.status).toBe('completed');
      expect(refund.amountKobo).toBe(order.totalKobo);
    });

    test('restocks inventory on refund', async () => {
      const rma = await createRMA({ status: 'inspecting' });
      const variantBefore = await getProductVariant(rma.returnItems[0].variantId);
      const quantityBefore = variantBefore.availableQuantity;
      
      await completeRMAWithOutcome(rma.id, 'refund', 'Defective unit');
      
      const variantAfter = await getProductVariant(rma.returnItems[0].variantId);
      expect(variantAfter.availableQuantity).toBe(
        quantityBefore + rma.returnItems[0].quantity
      );
    });

    test('posts refund to ledger', async () => {
      const rma = await createRMA({ status: 'inspecting' });
      
      await completeRMAWithOutcome(rma.id, 'refund', 'Damaged');
      
      const refund = await getRefundForRMA(rma.id);
      const entries = await getLedgerEntries({
        reference: `refund:${refund.id}`
      });
      expect(entries.length).toBeGreaterThan(0);
    });

    test('notifies customer of refund', async () => {
      const rma = await createRMA({ status: 'inspecting' });
      const order = await getOrder(rma.orderId);
      
      const spy = jest.spyOn(notifications, 'send');
      
      await completeRMAWithOutcome(rma.id, 'refund', 'Defective');
      
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: order.buyerId,
          eventType: 'rma.completed.refund'
        })
      );
    });
  });

  describe('complete_rma_with_outcome - reject decision', () => {
    test('transitions RMA to rejected', async () => {
      const rma = await createRMA({ status: 'inspecting' });
      
      const result = await completeRMAWithOutcome(
        rma.id,
        'reject',
        'Customer damage - not covered'
      );
      
      expect(result.status).toBe('rejected');
    });

    test('restocks inventory on reject', async () => {
      const rma = await createRMA({ status: 'inspecting' });
      const variantBefore = await getProductVariant(rma.returnItems[0].variantId);
      
      await completeRMAWithOutcome(rma.id, 'reject', 'Customer damaged');
      
      const variantAfter = await getProductVariant(rma.returnItems[0].variantId);
      expect(variantAfter.availableQuantity).toBeGreaterThan(
        variantBefore.availableQuantity
      );
    });

    test('does NOT create refund on reject', async () => {
      const rma = await createRMA({ status: 'inspecting' });
      
      await completeRMAWithOutcome(rma.id, 'reject', 'Not returnable');
      
      const refund = await getRefundForRMA(rma.id);
      expect(refund).toBeUndefined();
    });

    test('notifies customer of rejection', async () => {
      const rma = await createRMA({ status: 'inspecting' });
      
      const spy = jest.spyOn(notifications, 'send');
      
      await completeRMAWithOutcome(rma.id, 'reject', 'Damage not covered');
      
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'rma.completed.reject'
        })
      );
    });
  });

  describe('complete_rma_with_outcome - replace decision', () => {
    test('marks RMA as replaced', async () => {
      const rma = await createRMA({ status: 'inspecting' });
      
      const result = await completeRMAWithOutcome(rma.id, 'replace', 'Defective unit');
      
      expect(result.status).toBe('replaced');
    });

    test('restocks inventory', async () => {
      const rma = await createRMA({ status: 'inspecting' });
      const variantBefore = await getProductVariant(rma.returnItems[0].variantId);
      
      await completeRMAWithOutcome(rma.id, 'replace', 'Factory defect');
      
      const variantAfter = await getProductVariant(rma.returnItems[0].variantId);
      expect(variantAfter.availableQuantity).toBeGreaterThan(
        variantBefore.availableQuantity
      );
    });

    test('does NOT create refund on replace', async () => {
      const rma = await createRMA({ status: 'inspecting' });
      
      await completeRMAWithOutcome(rma.id, 'replace', 'Wrong model received');
      
      const refund = await getRefundForRMA(rma.id);
      expect(refund).toBeUndefined();
    });

    test('notifies customer of replacement shipping', async () => {
      const rma = await createRMA({ status: 'inspecting' });
      
      const spy = jest.spyOn(notifications, 'send');
      
      await completeRMAWithOutcome(rma.id, 'replace', 'Defective');
      
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'rma.completed.replace',
          title: expect.stringContaining('Replacement')
        })
      );
    });
  });

  describe('validation', () => {
    test('cannot complete with invalid decision', async () => {
      const rma = await createRMA({ status: 'inspecting' });
      
      const result = await completeRMAWithOutcome(
        rma.id,
        'invalid_decision',
        'Reason'
      ).catch(err => err);
      
      expect(result.message).toContain('INVALID');
    });

    test('cannot complete RMA not in inspecting status', async () => {
      const rma = await createRMA({ status: 'approved' });
      
      const result = await completeRMAWithOutcome(
        rma.id,
        'refund',
        'Reason'
      ).catch(err => err);
      
      expect(result.message).toContain('INVALID_STATUS');
    });

    test('cannot start inspection if not received', async () => {
      const rma = await createRMA({ status: 'approved' });
      
      const result = await startRMAInspection(rma.id).catch(err => err);
      expect(result.message).toContain('INVALID');
    });
  });
});
```

### Integration Tests

**File:** `tests/rma-workflow.integration.test.ts`

```typescript
describe('RMA Workflow - End-to-End', () => {
  test('full RMA lifecycle: approved → received → inspected → refunded', async () => {
    const customer = await createCustomer();
    const product = await createProduct();
    const order = await createOrder({
      buyerId: customer.id,
      productId: product.id
    });
    const rma = await createRMA(order.id, 'Product not as described');
    
    // Admin approves RMA
    const admin = await createAdmin();
    await admin.approveRMA(rma.id);
    expect((await getRMA(rma.id)).status).toBe('approved');
    
    // Customer receives shipping label, sends back product
    // Admin receives package
    await admin.markRMAReceived(rma.id);
    expect((await getRMA(rma.id)).status).toBe('received');
    
    // Admin starts inspection
    await admin.startRMAInspection(rma.id);
    expect((await getRMA(rma.id)).status).toBe('inspecting');
    
    // Admin inspects, decides to refund
    const completed = await admin.completeRMA(
      rma.id,
      'refund',
      'Item received with damage'
    );
    expect(completed.status).toBe('refunded');
    
    // Verify refund was processed
    const refund = await getRefundForRMA(rma.id);
    expect(refund.status).toBe('completed');
    
    // Verify customer received notifications
    const customerNotifs = await getCustomerNotifications(customer.id);
    expect(customerNotifs).toContainEqual(
      expect.objectContaining({ eventType: 'rma_approved' })
    );
    expect(customerNotifs).toContainEqual(
      expect.objectContaining({ eventType: 'rma.completed.refund' })
    );
  });

  test('RMA rejection does not issue refund', async () => {
    const order = await createOrder();
    const rma = await createRMA(order.id, 'Didn\'t work for me');
    
    const admin = await createAdmin();
    await admin.approveRMA(rma.id);
    await admin.markRMAReceived(rma.id);
    await admin.startRMAInspection(rma.id);
    
    const completed = await admin.completeRMA(
      rma.id,
      'reject',
      'Used product - not returnable'
    );
    
    expect(completed.status).toBe('rejected');
    expect(await getRefundForRMA(rma.id)).toBeUndefined();
  });

  test('multiple return items in single RMA', async () => {
    // Order with 2 products
    const order = await createMultiItemOrder();
    
    // Both items returned in same RMA
    const rma = await createRMA(order.id, 'Both defective');
    expect(rma.returnItems).toHaveLength(2);
    
    // Process RMA
    await approveAndCompleteRMA(rma.id, 'refund', 'Defective lot');
    
    // Both items' inventory should be restored
    for (const item of rma.returnItems) {
      const variant = await getProductVariant(item.variantId);
      expect(variant.availableQuantity).toBeGreaterThan(0);
    }
  });
});
```

---

## Issue 5: Multi-Item Orders - Testing

**(Abbreviated for space - similar structure to Issues 1-4)**

```typescript
describe('Multi-Item Orders', () => {
  test('add to cart workflow', async () => {
    const customer = await createCustomer();
    const cart = await createCart(customer.id);
    
    const product1 = await createProduct({ priceKobo: 50000 });
    const product2 = await createProduct({ priceKobo: 30000 });
    
    await addToCart(cart.id, product1.id, 2);
    await addToCart(cart.id, product2.id, 1);
    
    const items = await getCartItems(cart.id);
    expect(items).toHaveLength(2);
    expect(items[0].quantity).toBe(2);
  });

  test('multi-item checkout creates order with order_items', async () => {
    const cart = await buildCart([
      { productId: product1.id, qty: 2 },
      { productId: product2.id, qty: 1 }
    ]);
    
    const order = await checkout(cart.id);
    
    // Verify order_items created
    const items = await getOrderItems(order.id);
    expect(items).toHaveLength(2);
    expect(items.map(i => i.quantity)).toEqual([2, 1]);
    
    // Verify total calculated correctly
    expect(order.totalKobo).toBe(
      product1.priceKobo * 2 + product2.priceKobo * 1
    );
  });

  test('multi-supplier fulfillments created for multi-item order', async () => {
    const order = await createMultiItemOrder([
      { supplier: supplier1, product: product1 },
      { supplier: supplier1, product: product2 },
      { supplier: supplier2, product: product3 }
    ]);
    
    const fulfillments = await getFulfillments(order.id);
    
    // Should have 2 fulfillments (2 from supplier1, 1 from supplier2)
    expect(fulfillments).toHaveLength(2);
    expect(
      fulfillments.filter(f => f.supplierId === supplier1.id)
    ).toHaveLength(1); // 2 items consolidated
  });

  test('partial refund on multi-item order', async () => {
    const order = await createMultiItemOrder(3); // 3 items
    
    const items = await getOrderItems(order.id);
    const item1Total = items[0].totalKobo;
    
    // Refund only first item
    const refund = await requestRefund(order.id, item1Total);
    await approveAndCompleteRefund(refund.id);
    
    // Verify refund amount correct
    expect(refund.amountKobo).toBe(item1Total);
  });
});
```

---

## Test Data & Fixtures

### Database Fixtures

**File:** `tests/fixtures/database.ts`

```typescript
export async function resetTestDatabase() {
  // Clear all tables in reverse FK order
  // Re-seed minimal data
}

export async function createTestCustomer(overrides?: Partial<User>) {
  return createUser({ role: 'customer', ...overrides });
}

export async function createTestAdmin(overrides?: Partial<Admin>) {
  return createAdmin({ role: 'admin', ...overrides });
}

export async function createTestOrder(overrides?: Partial<Order>) {
  return createOrder({ ...overrides });
}

// ... More fixtures
```

### Mock Data

**File:** `tests/fixtures/mocks.ts`

```typescript
export const MOCK_PRODUCT = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Test Product',
  priceKobo: 100000,
  supplierId: '00000000-0000-0000-0000-000000000101',
};

export const MOCK_CUSTOMER = {
  id: '00000000-0000-0000-0000-000000000201',
  name: 'Test Customer',
  email: 'customer@test.vura',
};

// ... More mocks
```

---

## Test Execution Strategy

### Before Merge

```bash
# Run all tests
npm test

# With coverage report
npm test -- --coverage

# Only integration tests
npm test -- --testPathPattern=integration

# Only Issue 1 tests
npm test -- --testPathPattern=permissions
```

### CI/CD Pipeline

```yaml
on: push

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: vura_test
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run migrate:test
      - run: npm test -- --coverage
      - run: npm run lint
```

---

## Success Metrics

| Metric | Target | Verification |
|--------|--------|--------------|
| Code Coverage | > 85% | Coverage report |
| Permission Checks | 100% of endpoints | Grep verification |
| Concurrent Edit Tests | Zero data corruption | Load test results |
| Refund E2E | 100% success rate | Transaction logs |
| RMA E2E | 100% success rate | Customer notifications |
| Multi-item Order | 100% items delivered correctly | Fulfillment reports |

