ALTER TABLE public.profiles ADD COLUMN exclusive_tours_enabled boolean NOT NULL DEFAULT false;
CREATE FUNCTION public.guard_exclusive_tours_access() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF current_user IN ('service_role','supabase_admin','postgres') OR public.has_role(auth.uid(),'admin') THEN RETURN NEW; END IF;
 IF (TG_OP = 'INSERT' AND NEW.exclusive_tours_enabled) OR (TG_OP = 'UPDATE' AND NEW.exclusive_tours_enabled IS DISTINCT FROM OLD.exclusive_tours_enabled) THEN RAISE EXCEPTION 'Nur Admins dürfen Exklusivtouren freischalten'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER guard_exclusive_tours_access BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_exclusive_tours_access();
CREATE FUNCTION public.merchant_exclusive_tours_enabled() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE user_id = public.merchant_owner_id(auth.uid()) AND approved AND exclusive_tours_enabled);
$$;
REVOKE ALL ON FUNCTION public.merchant_exclusive_tours_enabled() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merchant_exclusive_tours_enabled() TO authenticated;
CREATE FUNCTION public.merchant_exclusive_tours(_history boolean DEFAULT false, _page integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb; owner_id uuid := public.merchant_owner_id(auth.uid());
BEGIN
 IF NOT public.merchant_exclusive_tours_enabled() THEN RAISE EXCEPTION 'Exklusivtouren sind nicht freigeschaltet' USING ERRCODE = '42501'; END IF;
 IF _page < 0 OR _page > 10000 THEN RAISE EXCEPTION 'Ungültige Seite'; END IF;
 WITH eligible AS (
 SELECT r.id,r.name,r.datum,r.start_time,r.status FROM public.routes r
 WHERE r.exclusive_merchant_user_id = owner_id AND (CASE WHEN _history THEN r.datum < (now() AT TIME ZONE 'Europe/Berlin')::date ELSE r.datum >= (now() AT TIME ZONE 'Europe/Berlin')::date END)
 ), paged AS (
 SELECT * FROM eligible ORDER BY CASE WHEN NOT _history THEN datum END ASC, CASE WHEN _history THEN datum END DESC, start_time,id LIMIT 20 OFFSET (_page * 20)
 ), summaries AS (
 SELECT r.*, count(s.id)::integer AS stops, count(s.id) FILTER (WHERE s.status = 'erledigt')::integer AS delivered,
 count(s.id) FILTER (WHERE s.status = 'uebersprungen')::integer AS skipped, coalesce(sum(o.pakete),0)::integer AS parcels
 FROM paged r LEFT JOIN public.route_stops s ON s.route_id = r.id AND EXISTS (SELECT 1 FROM public.orders x WHERE x.id=s.order_id AND public.merchant_owner_id(x.user_id)=owner_id)
 LEFT JOIN public.orders o ON o.id=s.order_id GROUP BY r.id,r.name,r.datum,r.start_time,r.status
 ) SELECT jsonb_build_object('routes',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY CASE WHEN NOT _history THEN datum END ASC, CASE WHEN _history THEN datum END DESC,start_time,id) FROM summaries s),'[]'::jsonb),'has_more',(SELECT count(*) FROM eligible) > ((_page+1)*20)) INTO result;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.merchant_exclusive_tours(boolean,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merchant_exclusive_tours(boolean,integer) TO authenticated;
CREATE FUNCTION public.merchant_exclusive_tour_detail(_route_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE owner_id uuid := public.merchant_owner_id(auth.uid()); result jsonb;
BEGIN
 IF NOT public.merchant_exclusive_tours_enabled() OR NOT EXISTS (SELECT 1 FROM public.routes WHERE id=_route_id AND exclusive_merchant_user_id=owner_id) THEN RAISE EXCEPTION 'Tour nicht verfügbar' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'position',s.position,'status',s.status,'eta',s.eta,'delivered_at',s.delivered_at,'auftrags_nr',o.auftrags_nr,'empfaenger_name',o.empfaenger_name,'empfaenger_adresse',o.empfaenger_adresse,'empfaenger_plz',o.empfaenger_plz,'empfaenger_stadt',o.empfaenger_stadt,'pakete',o.pakete) ORDER BY s.position),'[]'::jsonb) INTO result FROM public.route_stops s JOIN public.orders o ON o.id=s.order_id WHERE s.route_id=_route_id AND public.merchant_owner_id(o.user_id)=owner_id;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.merchant_exclusive_tour_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merchant_exclusive_tour_detail(uuid) TO authenticated;
CREATE INDEX IF NOT EXISTS routes_exclusive_merchant_date_idx ON public.routes(exclusive_merchant_user_id,datum) WHERE exclusive_merchant_user_id IS NOT NULL;