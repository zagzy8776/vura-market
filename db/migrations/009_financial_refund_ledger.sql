BEGIN;

-- Immutable accounting entries for payment/refund state transitions.
CREATE OR REPLACE FUNCTION post_refund_ledger(
  p_refund_id uuid,
  p_actor_user_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  r refunds%ROWTYPE;
  t payment_transactions%ROWTYPE;
  clearing uuid;
  refund_payable uuid;
  ref text;
BEGIN
  SELECT * INTO r FROM refunds WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REFUND_NOT_FOUND'; END IF;
  IF r.status <> 'completed' THEN RAISE EXCEPTION 'REFUND_NOT_COMPLETED'; END IF;
  IF r.payment_transaction_id IS NULL THEN RAISE EXCEPTION 'REFUND_PAYMENT_NOT_LINKED'; END IF;

  SELECT * INTO t FROM payment_transactions WHERE id = r.payment_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND'; END IF;

  SELECT id INTO clearing FROM ledger_accounts WHERE code = 'PAYMENT_CLEARING' LIMIT 1;
  SELECT id INTO refund_payable FROM ledger_accounts WHERE code = 'REFUND_PAYABLE' LIMIT 1;
  IF clearing IS NULL OR refund_payable IS NULL THEN RAISE EXCEPTION 'LEDGER_ACCOUNTS_MISSING'; END IF;

  ref := 'refund:' || r.id::text;

  INSERT INTO ledger_entries(transaction_id, order_id, account_id, entry_type, amount_kobo, reference, metadata)
  VALUES
    (t.id, r.order_id, refund_payable, 'refund_payable', r.amount_kobo, ref, jsonb_build_object('refund_id', r.id, 'actor_user_id', p_actor_user_id)),
    (t.id, r.order_id, clearing, 'refund_clearing', -r.amount_kobo, ref, jsonb_build_object('refund_id', r.id, 'actor_user_id', p_actor_user_id))
  ON CONFLICT (reference, account_id) DO NOTHING;

  UPDATE payment_transactions
  SET status = CASE
      WHEN r.amount_kobo >= amount_kobo THEN 'refunded'
      ELSE 'partially_refunded'
    END,
    updated_at = now()
  WHERE id = t.id;
END;
$$;

-- Completed refunds must have a payment transaction before they can be posted.
CREATE OR REPLACE FUNCTION enforce_refund_completion_link()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.payment_transaction_id IS NULL THEN
    RAISE EXCEPTION 'COMPLETED_REFUND_REQUIRES_PAYMENT';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS refunds_completion_link ON refunds;
CREATE TRIGGER refunds_completion_link
BEFORE INSERT OR UPDATE ON refunds
FOR EACH ROW EXECUTE FUNCTION enforce_refund_completion_link();

COMMIT;
