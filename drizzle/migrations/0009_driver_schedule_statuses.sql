CREATE TABLE public.driver_schedule_statuses (
  key text PRIMARY KEY,
  label text NOT NULL,
  short text NOT NULL,
  color text NOT NULL DEFAULT 'gruen',
  is_duty boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_schedule_statuses TO authenticated;
GRANT ALL ON public.driver_schedule_statuses TO service_role;
ALTER TABLE public.driver_schedule_statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage schedule statuses" ON public.driver_schedule_statuses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_schedule_statuses_updated BEFORE UPDATE ON public.driver_schedule_statuses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.driver_schedule_statuses (key,label,short,color,is_duty,active,sort_order) VALUES
 ('bochum_bringts','Bochum bringt´s','BB','gruen',true,true,1),
 ('potpourri','Potpourri','PP','gruen_hell',true,true,2),
 ('delinat','Delinat','DE','blau',true,true,3),
 ('altkleidertaxi','Altkleidertaxi','AT','gelb',true,true,4),
 ('regiothek','Regiothek','RT','grau',true,true,5),
 ('sonderauftrag','Sonderauftrag','SA','gruen_dunkel',true,true,6),
 ('dienst','Dienst (alt)','D','gruen',true,false,7),
 ('urlaub','Urlaub','U','rot_mittel',false,true,10),
 ('krank','Krank','K','rot',false,true,11),
 ('nicht_verfuegbar','Nicht verfügbar','N','rot_hell',false,true,12);
ALTER TABLE public.driver_schedules DROP CONSTRAINT IF EXISTS driver_schedules_status_check;
ALTER TABLE public.driver_schedules ADD CONSTRAINT driver_schedules_status_fkey FOREIGN KEY (status) REFERENCES public.driver_schedule_statuses(key) ON UPDATE CASCADE ON DELETE RESTRICT;
COMMENT ON COLUMN public.driver_schedule_settings.enabled_statuses IS 'DEPRECATED: replaced by driver_schedule_statuses.active';