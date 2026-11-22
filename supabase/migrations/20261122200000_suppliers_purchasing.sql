-- Suppliers and purchase orders for florists (2026-11-22).
-- Each store keeps its own suppliers (flower wholesalers, vases, ribbons…)
-- and sends purchase orders to them, usually over WhatsApp.

CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  category text NOT NULL DEFAULT 'flowers',
  contact_name text,
  phone text,
  whatsapp text,
  email text,
  order_days text[] NOT NULL DEFAULT '{}',
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS suppliers_store_idx ON public.suppliers (store_id);

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','received','cancelled')),
  needed_by date,
  items jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items) = 'array'),
  notes text,
  total numeric(12,2) NOT NULL DEFAULT 0,
  sent_at timestamptz,
  received_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchase_orders_store_idx ON public.purchase_orders (store_id, created_at DESC);

-- A purchase order may only point at a supplier of the same store.
CREATE OR REPLACE FUNCTION public.purchase_order_same_store()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers s WHERE s.id = NEW.supplier_id AND s.store_id = NEW.store_id
  ) THEN
    RAISE EXCEPTION 'supplier belongs to another store' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.purchase_order_same_store() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS purchase_orders_same_store ON public.purchase_orders;
CREATE TRIGGER purchase_orders_same_store
  BEFORE INSERT OR UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.purchase_order_same_store();

DROP TRIGGER IF EXISTS suppliers_updated ON public.suppliers;
CREATE TRIGGER suppliers_updated BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS purchase_orders_updated ON public.purchase_orders;
CREATE TRIGGER purchase_orders_updated BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

-- Store members (owner, manager, staff) and platform admins only. No public access.
DROP POLICY IF EXISTS "store members manage suppliers" ON public.suppliers;
CREATE POLICY "store members manage suppliers" ON public.suppliers
  FOR ALL TO authenticated
  USING (is_store_member(store_id, auth.uid()) OR has_role(auth.uid(), 'admin'))
  WITH CHECK (is_store_member(store_id, auth.uid()) OR has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "store members manage purchase orders" ON public.purchase_orders;
CREATE POLICY "store members manage purchase orders" ON public.purchase_orders
  FOR ALL TO authenticated
  USING (is_store_member(store_id, auth.uid()) OR has_role(auth.uid(), 'admin'))
  WITH CHECK (is_store_member(store_id, auth.uid()) OR has_role(auth.uid(), 'admin'));

REVOKE ALL ON public.suppliers, public.purchase_orders FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers, public.purchase_orders TO authenticated;
