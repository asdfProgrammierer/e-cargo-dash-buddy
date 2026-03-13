
CREATE TABLE public.address_book (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  firma_name text,
  ansprechpartner text NOT NULL,
  email text,
  telefon text,
  strasse text,
  plz text,
  stadt text,
  notizen text,
  is_favorite boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.address_book ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own contacts" ON public.address_book FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own contacts" ON public.address_book FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own contacts" ON public.address_book FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own contacts" ON public.address_book FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_address_book_updated_at BEFORE UPDATE ON public.address_book FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
