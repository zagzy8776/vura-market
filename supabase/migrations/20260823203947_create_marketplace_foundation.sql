/*
# Create marketplace foundation

1. Purpose
- Creates the secure data foundation for a Nigerian digital services marketplace.
- Supports account profiles, protected wallets, transaction history, and a public service catalog.

2. New tables and columns
- `profiles`
  - `id`: the signed-in user's auth ID.
  - `display_name`: the user's chosen name.
  - `phone`: optional phone number for service delivery.
  - `avatar_url`: optional profile image URL.
  - `country_code`: the user's market, defaulting to Nigeria (NG).
  - `created_at`, `updated_at`: timestamps.
- `wallets`
  - `id`: wallet identifier.
  - `user_id`: wallet owner.
  - `balance_kobo`: balance stored as whole Nigerian kobo to avoid rounding errors.
  - `currency`: wallet currency, default NGN.
  - `created_at`, `updated_at`: timestamps.
- `transactions`
  - `id`: transaction identifier.
  - `user_id`: account owner.
  - `service_slug`: purchased service category.
  - `reference`: unique transaction reference.
  - `amount_kobo`: transaction amount in kobo.
  - `status`: pending, successful, or failed.
  - `metadata`: non-sensitive service details.
  - `created_at`: creation timestamp.
- `service_catalog`
  - `slug`: stable service identifier.
  - `name`, `description`, `category`, `icon_name`: display information.
  - `is_active`, `sort_order`: catalog visibility and ordering.

3. Security
- Enables row-level security on every table.
- Public users can only read active catalog items.
- Signed-in users can read only their own profile, wallet, and transactions.
- Wallet balances and transaction records are not writable by the browser.
- Profile updates are limited to user-editable columns.
- A secure signup trigger creates the profile and zero-balance wallet automatically.

4. Important notes
- Monetary values are stored in kobo, not floating-point naira.
- Future provider integrations and funding flows should write through server-side functions or edge functions.
- Policies are recreated safely so this migration can be applied again without duplicating them.
*/

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  phone text,
  avatar_url text,
  country_code text NOT NULL DEFAULT 'NG',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  balance_kobo bigint NOT NULL DEFAULT 0 CHECK (balance_kobo >= 0),
  currency text NOT NULL DEFAULT 'NGN',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  service_slug text NOT NULL,
  reference text NOT NULL UNIQUE,
  amount_kobo bigint NOT NULL CHECK (amount_kobo >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'successful', 'failed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.service_catalog (
  slug text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  icon_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transactions_user_created_idx ON public.transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS service_catalog_active_sort_idx ON public.service_catalog (is_active, sort_order);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_catalog ENABLE ROW LEVEL SECURITY;

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (display_name, phone, avatar_url, country_code) ON public.profiles TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.wallets FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.transactions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.service_catalog FROM anon, authenticated;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_delete_own" ON public.profiles;
CREATE POLICY "profiles_delete_own" ON public.profiles FOR DELETE TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "wallets_select_own" ON public.wallets;
CREATE POLICY "wallets_select_own" ON public.wallets FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "wallets_insert_own" ON public.wallets;
CREATE POLICY "wallets_insert_own" ON public.wallets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "wallets_update_own" ON public.wallets;
CREATE POLICY "wallets_update_own" ON public.wallets FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "wallets_delete_own" ON public.wallets;
CREATE POLICY "wallets_delete_own" ON public.wallets FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "transactions_select_own" ON public.transactions;
CREATE POLICY "transactions_select_own" ON public.transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "transactions_insert_own" ON public.transactions;
CREATE POLICY "transactions_insert_own" ON public.transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "transactions_update_own" ON public.transactions;
CREATE POLICY "transactions_update_own" ON public.transactions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "transactions_delete_own" ON public.transactions;
CREATE POLICY "transactions_delete_own" ON public.transactions FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "service_catalog_select_active" ON public.service_catalog;
CREATE POLICY "service_catalog_select_active" ON public.service_catalog FOR SELECT TO anon, authenticated USING (is_active = true);
DROP POLICY IF EXISTS "service_catalog_insert_admin" ON public.service_catalog;
CREATE POLICY "service_catalog_insert_admin" ON public.service_catalog FOR INSERT TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "service_catalog_update_admin" ON public.service_catalog;
CREATE POLICY "service_catalog_update_admin" ON public.service_catalog FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "service_catalog_delete_admin" ON public.service_catalog;
CREATE POLICY "service_catalog_delete_admin" ON public.service_catalog FOR DELETE TO authenticated USING (false);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.wallets (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.service_catalog (slug, name, description, category, icon_name, sort_order)
VALUES
  ('airtime', 'Airtime', 'Instant recharge for every network', 'Everyday essentials', 'smartphone', 1),
  ('data', 'Data bundles', 'Affordable data plans that never expire late', 'Everyday essentials', 'wifi', 2),
  ('electricity', 'Electricity', 'Pay power bills and stay connected', 'Bills & utilities', 'zap', 3),
  ('cable-tv', 'Cable TV', 'Keep your favourite channels on', 'Bills & utilities', 'tv', 4),
  ('betting', 'Betting wallet', 'Fund your favourite betting platforms', 'Digital wallets', 'trophy', 5),
  ('gift-cards', 'Gift cards', 'Shop global brands with confidence', 'Digital wallets', 'gift', 6),
  ('esims', 'eSIMs', 'Travel-ready mobile connectivity', 'Travel & lifestyle', 'sim-card', 7),
  ('flight-hotel', 'Flights & hotels', 'Book your next trip in one place', 'Travel & lifestyle', 'plane', 8),
  ('exams', 'Exam vouchers', 'WAEC, JAMB and more, instantly', 'Education', 'graduation-cap', 9),
  ('crypto', 'Crypto trading', 'Simple, secure digital asset access', 'Finance', 'bitcoin', 10),
  ('p2p', 'P2P exchange', 'Trade value with people you trust', 'Finance', 'arrow-left-right', 11),
  ('internet', 'Internet', 'Home internet subscriptions', 'Bills & utilities', 'router', 12)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  icon_name = EXCLUDED.icon_name,
  sort_order = EXCLUDED.sort_order;
