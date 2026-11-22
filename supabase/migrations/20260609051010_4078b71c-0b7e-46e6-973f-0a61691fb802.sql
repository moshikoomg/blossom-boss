DROP POLICY IF EXISTS "store owners update members" ON public.store_members;
CREATE POLICY "store owners update members"
ON public.store_members
FOR UPDATE
USING (
  (EXISTS (SELECT 1 FROM public.store_members sm WHERE sm.store_id = store_members.store_id AND sm.user_id = auth.uid() AND sm.role = 'owner'))
  AND user_id <> auth.uid()
)
WITH CHECK (
  (EXISTS (SELECT 1 FROM public.store_members sm WHERE sm.store_id = store_members.store_id AND sm.user_id = auth.uid() AND sm.role = 'owner'))
  AND user_id <> auth.uid()
  AND role = ANY (ARRAY['owner','manager','staff'])
);
