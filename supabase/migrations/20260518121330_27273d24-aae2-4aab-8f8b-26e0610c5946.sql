-- Prevent users from modifying parent_user_id on their own profile (privilege escalation guard)
CREATE OR REPLACE FUNCTION public.prevent_parent_user_id_self_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.parent_user_id IS DISTINCT FROM OLD.parent_user_id
     AND COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'parent_user_id darf nicht geändert werden';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_parent_change ON public.profiles;
CREATE TRIGGER profiles_prevent_parent_change
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_parent_user_id_self_change();