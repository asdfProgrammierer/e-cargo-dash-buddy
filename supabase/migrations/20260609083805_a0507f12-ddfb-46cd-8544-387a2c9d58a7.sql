DROP TRIGGER IF EXISTS trg_prevent_parent_user_id_self_change ON public.profiles;
CREATE TRIGGER trg_prevent_parent_user_id_self_change
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_parent_user_id_self_change();