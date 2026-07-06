
-- 1. Audit log table
CREATE TABLE public.admin_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_user_id UUID,
  actor_role TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  action TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX admin_audit_log_created_at_idx ON public.admin_audit_log (created_at DESC);
CREATE INDEX admin_audit_log_entity_idx ON public.admin_audit_log (entity_type, entity_id);
CREATE INDEX admin_audit_log_actor_idx ON public.admin_audit_log (actor_user_id);

GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit log"
  ON public.admin_audit_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- No INSERT/UPDATE/DELETE policies: only service_role and SECURITY DEFINER triggers can write; nobody can modify or delete → tamper-evident.

-- 2. Audit triggers
CREATE OR REPLACE FUNCTION public.audit_user_roles()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.admin_audit_log (actor_user_id, actor_role, entity_type, entity_id, action, new_value)
    VALUES (auth.uid(), COALESCE(auth.role(), 'unknown'), 'user_role', NEW.user_id::text, 'role_granted',
            jsonb_build_object('role', NEW.role));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.admin_audit_log (actor_user_id, actor_role, entity_type, entity_id, action, old_value)
    VALUES (auth.uid(), COALESCE(auth.role(), 'unknown'), 'user_role', OLD.user_id::text, 'role_revoked',
            jsonb_build_object('role', OLD.role));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER audit_user_roles_trg
AFTER INSERT OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.audit_user_roles();

CREATE OR REPLACE FUNCTION public.audit_profile_approval()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.approved IS DISTINCT FROM OLD.approved THEN
    INSERT INTO public.admin_audit_log (actor_user_id, actor_role, entity_type, entity_id, action, old_value, new_value)
    VALUES (auth.uid(), COALESCE(auth.role(), 'unknown'), 'profile', NEW.user_id::text,
            CASE WHEN NEW.approved THEN 'merchant_approved' ELSE 'merchant_suspended' END,
            jsonb_build_object('approved', OLD.approved),
            jsonb_build_object('approved', NEW.approved));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_profile_approval_trg
AFTER UPDATE OF approved ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.audit_profile_approval();

CREATE OR REPLACE FUNCTION public.audit_order_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.admin_audit_log (actor_user_id, actor_role, entity_type, entity_id, action, old_value, new_value, metadata)
    VALUES (auth.uid(), COALESCE(auth.role(), 'unknown'), 'order', NEW.id::text, 'status_changed',
            jsonb_build_object('status', OLD.status),
            jsonb_build_object('status', NEW.status),
            jsonb_build_object('auftrags_nr', NEW.auftrags_nr, 'merchant_user_id', NEW.user_id));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_order_status_trg
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.audit_order_status();

-- 3. Revoke EXECUTE from anon on admin/driver/internal helpers (they still work for authenticated & service_role)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (
        p.proname LIKE 'admin\_%' ESCAPE '\'
        OR p.proname LIKE 'driver\_%' ESCAPE '\'
        OR p.proname IN (
          'audit_user_roles','audit_profile_approval','audit_order_status',
          'prevent_non_admin_order_status_change','prevent_parent_user_id_self_change',
          'prevent_driver_self_column_change','generate_auftrags_nr','generate_tracking_token',
          'sync_order_delivered_at','ensure_single_default_depot','handle_new_user',
          'maybe_create_pickup_order','email_queue_wake','email_queue_dispatch',
          'enqueue_email','read_email_batch','delete_email','move_to_dlq',
          'cleanup_stale_work_sessions','gdpr_cleanup_personal_data'
        )
      )
  LOOP
    EXECUTE 'REVOKE EXECUTE ON FUNCTION '||r.sig||' FROM anon, public';
  END LOOP;
END $$;

-- 4. GDPR export RPC (admin-only, JSON dump of everything tied to a merchant)
CREATE OR REPLACE FUNCTION public.admin_export_merchant_data(_profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  owner_id UUID;
  sub_ids UUID[];
  result JSONB;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Nur Admins dürfen exportieren';
  END IF;

  SELECT user_id INTO owner_id FROM public.profiles WHERE id = _profile_id;
  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'Händler nicht gefunden';
  END IF;

  SELECT COALESCE(array_agg(user_id), '{}') INTO sub_ids
  FROM public.profiles WHERE parent_user_id = owner_id;

  SELECT jsonb_build_object(
    'exported_at', now(),
    'exported_by', auth.uid(),
    'profile', (SELECT to_jsonb(p) FROM public.profiles p WHERE p.user_id = owner_id),
    'sub_accounts', (SELECT COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb) FROM public.profiles p WHERE p.parent_user_id = owner_id),
    'orders', (SELECT COALESCE(jsonb_agg(to_jsonb(o)), '[]'::jsonb) FROM public.orders o WHERE o.user_id = owner_id),
    'order_status_history', (SELECT COALESCE(jsonb_agg(to_jsonb(h)), '[]'::jsonb) FROM public.order_status_history h WHERE h.user_id = owner_id),
    'address_book', (SELECT COALESCE(jsonb_agg(to_jsonb(a)), '[]'::jsonb) FROM public.address_book a WHERE a.user_id = owner_id),
    'shop_connections', (SELECT COALESCE(jsonb_agg(to_jsonb(s) - 'api_key'), '[]'::jsonb) FROM public.shop_connections s WHERE s.user_id = owner_id),
    'notifications', (SELECT COALESCE(jsonb_agg(to_jsonb(n)), '[]'::jsonb) FROM public.notifications n WHERE n.target_user_id = owner_id),
    'user_roles', (SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM public.user_roles r WHERE r.user_id = owner_id OR r.user_id = ANY(sub_ids)),
    'push_subscriptions_count', (SELECT COUNT(*) FROM public.push_subscriptions ps WHERE ps.user_id = owner_id OR ps.user_id = ANY(sub_ids))
  ) INTO result;

  INSERT INTO public.admin_audit_log (actor_user_id, actor_role, entity_type, entity_id, action, metadata)
  VALUES (auth.uid(), 'admin', 'profile', owner_id::text, 'gdpr_export',
          jsonb_build_object('profile_id', _profile_id));

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_export_merchant_data(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_export_merchant_data(UUID) TO authenticated;
