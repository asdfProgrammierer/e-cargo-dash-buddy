-- 1. Sub-account linkage
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS parent_user_id uuid;
CREATE INDEX IF NOT EXISTS idx_profiles_parent_user_id ON public.profiles(parent_user_id);

-- 2. Helper: resolves the owning (parent) merchant user_id
CREATE OR REPLACE FUNCTION public.merchant_owner_id(_uid uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.parent_user_id FROM public.profiles p WHERE p.user_id = _uid LIMIT 1),
    _uid
  );
$$;

-- 3. Orders RLS: scope by merchant owner instead of plain auth.uid()
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can insert own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can update own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can delete own orders" ON public.orders;

CREATE POLICY "Users can view own orders" ON public.orders
  FOR SELECT TO authenticated
  USING (user_id = public.merchant_owner_id(auth.uid()));

CREATE POLICY "Users can insert own orders" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.merchant_owner_id(auth.uid()));

CREATE POLICY "Users can update own orders" ON public.orders
  FOR UPDATE TO authenticated
  USING (user_id = public.merchant_owner_id(auth.uid()))
  WITH CHECK (user_id = public.merchant_owner_id(auth.uid()));

CREATE POLICY "Users can delete own orders" ON public.orders
  FOR DELETE TO authenticated
  USING (user_id = public.merchant_owner_id(auth.uid()));

-- 4. Order status history
DROP POLICY IF EXISTS "Users can view own order history" ON public.order_status_history;
CREATE POLICY "Users can view own order history" ON public.order_status_history
  FOR SELECT TO authenticated
  USING (user_id = public.merchant_owner_id(auth.uid()));

-- 5. Address book RLS: shared between parent and sub-accounts
DROP POLICY IF EXISTS "Users can view own contacts" ON public.address_book;
DROP POLICY IF EXISTS "Users can insert own contacts" ON public.address_book;
DROP POLICY IF EXISTS "Users can update own contacts" ON public.address_book;
DROP POLICY IF EXISTS "Users can delete own contacts" ON public.address_book;

CREATE POLICY "Users can view own contacts" ON public.address_book
  FOR SELECT TO authenticated
  USING (user_id = public.merchant_owner_id(auth.uid()));

CREATE POLICY "Users can insert own contacts" ON public.address_book
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.merchant_owner_id(auth.uid()));

CREATE POLICY "Users can update own contacts" ON public.address_book
  FOR UPDATE TO authenticated
  USING (user_id = public.merchant_owner_id(auth.uid()))
  WITH CHECK (user_id = public.merchant_owner_id(auth.uid()));

CREATE POLICY "Users can delete own contacts" ON public.address_book
  FOR DELETE TO authenticated
  USING (user_id = public.merchant_owner_id(auth.uid()));

-- 6. Profiles: allow sub-accounts to read parent's profile (for sender defaults)
DROP POLICY IF EXISTS "Sub-accounts can view parent profile" ON public.profiles;
CREATE POLICY "Sub-accounts can view parent profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (user_id = public.merchant_owner_id(auth.uid()));

-- 7. Allow parent to view own sub-account profile rows (for the management UI)
DROP POLICY IF EXISTS "Parents can view their sub-account profiles" ON public.profiles;
CREATE POLICY "Parents can view their sub-account profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (parent_user_id = auth.uid());