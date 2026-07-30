CREATE INDEX IF NOT EXISTS idx_routes_datum_desc ON public.routes USING btree (datum DESC);
CREATE INDEX IF NOT EXISTS idx_routes_driver_datum ON public.routes USING btree (driver_id, datum DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_created_not_pickup ON public.orders USING btree (user_id, created_at DESC) WHERE (is_pickup = false);
CREATE INDEX IF NOT EXISTS idx_address_book_user ON public.address_book USING btree (user_id, created_at DESC);