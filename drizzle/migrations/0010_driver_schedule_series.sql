ALTER TABLE public.driver_schedules ADD COLUMN series_id uuid;
WITH batches AS (
 SELECT driver_id, created_at, status, gen_random_uuid() AS series_id
 FROM public.driver_schedules GROUP BY driver_id, created_at, status
)
UPDATE public.driver_schedules s SET series_id = b.series_id
FROM batches b WHERE s.driver_id = b.driver_id AND s.created_at = b.created_at AND s.status = b.status;
ALTER TABLE public.driver_schedules ALTER COLUMN series_id SET DEFAULT gen_random_uuid();
CREATE INDEX driver_schedules_driver_series_idx ON public.driver_schedules (driver_id, series_id);
COMMENT ON COLUMN public.driver_schedules.series_id IS 'Groups entries from one range or recurring save for scoped deletion; legacy entries grouped by driver, original creation timestamp and current status.';