-- Fix self-approval escalation: protect admin-controlled columns on public.profiles

-- 1. Restrict the user UPDATE policy so the user cannot change the row owner (user_id).
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. Tighten the admin UPDATE policy so it only applies to admins and cannot change row ownership.
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

CREATE POLICY "Admins can update all profiles"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Trigger that blocks non-admins/service from changing admin-controlled fields.
CREATE OR REPLACE FUNCTION public.protect_profile_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Admins and internal Supabase service roles may update anything
  IF current_user IN ('service_role', 'supabase_admin', 'postgres')
     OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- Non-admins may not modify these admin-controlled fields
  IF NEW.approved IS DISTINCT FROM OLD.approved THEN
    RAISE EXCEPTION 'Nur Admins dürfen den Genehmigungsstatus ändern';
  END IF;
  IF NEW.dhl_enabled IS DISTINCT FROM OLD.dhl_enabled THEN
    RAISE EXCEPTION 'Nur Admins dürfen den DHL-Status ändern';
  END IF;
  IF NEW.merchant_code IS DISTINCT FROM OLD.merchant_code THEN
    RAISE EXCEPTION 'Nur Admins dürfen den Händlercode ändern';
  END IF;
  IF NEW.is_virtual IS DISTINCT FROM OLD.is_virtual THEN
    RAISE EXCEPTION 'Nur Admins dürfen das virtuelle Händler-Flag ändern';
  END IF;
  IF NEW.parent_user_id IS DISTINCT FROM OLD.parent_user_id THEN
    RAISE EXCEPTION 'Nur Admins dürfen die übergeordnete Händler-Zuordnung ändern';
  END IF;
  IF NEW.paketpreis IS DISTINCT FROM OLD.paketpreis THEN
    RAISE EXCEPTION 'Nur Admins dürfen den Paketpreis ändern';
  END IF;
  IF NEW.pickup_enabled IS DISTINCT FROM OLD.pickup_enabled THEN
    RAISE EXCEPTION 'Nur Admins dürfen Abhol-Einstellungen ändern';
  END IF;
  IF NEW.pickup_weekdays IS DISTINCT FROM OLD.pickup_weekdays THEN
    RAISE EXCEPTION 'Nur Admins dürfen Abhol-Einstellungen ändern';
  END IF;
  IF NEW.pickup_time IS DISTINCT FROM OLD.pickup_time THEN
    RAISE EXCEPTION 'Nur Admins dürfen Abhol-Einstellungen ändern';
  END IF;
  IF NEW.pickup_note IS DISTINCT FROM OLD.pickup_note THEN
    RAISE EXCEPTION 'Nur Admins dürfen Abhol-Einstellungen ändern';
  END IF;

  -- Also prevent the row owner from changing their own user_id
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'user_id kann nicht geändert werden';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_admin_fields_trg ON public.profiles;

CREATE TRIGGER protect_profile_admin_fields_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_admin_fields();
