UPDATE tax_service_products
SET
  included_in_plans = ARRAY['starter', 'pro']::text[],
  updated_at = now()
WHERE code IN ('income_tax_private', 'income_tax_entrepreneur');

UPDATE tax_service_products
SET
  included_in_plans = ARRAY[]::text[],
  updated_at = now()
WHERE code = 'vat_return';
