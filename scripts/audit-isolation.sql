-- Multi-tenant isolation audit.
-- Proves that no row id is shared between two stores. Each query MUST
-- return zero rows. Run with: psql -v new=<uuid> -v template=<uuid> -f scripts/audit-isolation.sql
-- (or substitute the UUIDs inline.)

\set new        '''00000000-0000-0000-0000-000000000000'''
\set template   '''11111111-1111-1111-1111-111111111111'''

-- 1) Products: ids from the new store must not intersect the template.
SELECT id FROM products WHERE store_id = :new
INTERSECT
SELECT id FROM products WHERE store_id = :template;

-- 2) Categories: same invariant.
SELECT id FROM categories WHERE store_id = :new
INTERSECT
SELECT id FROM categories WHERE store_id = :template;

-- 3) Add-ons: same invariant.
SELECT id FROM add_ons WHERE store_id = :new
INTERSECT
SELECT id FROM add_ons WHERE store_id = :template;

-- 4) Global sanity: detect ANY duplicate id across stores in each catalog table.
SELECT 'products' AS tbl, id, COUNT(*) FROM products GROUP BY id HAVING COUNT(*) > 1
UNION ALL
SELECT 'categories', id, COUNT(*) FROM categories GROUP BY id HAVING COUNT(*) > 1
UNION ALL
SELECT 'add_ons', id, COUNT(*) FROM add_ons GROUP BY id HAVING COUNT(*) > 1;
