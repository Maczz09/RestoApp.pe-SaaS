-- Preserve plan codes already assigned before the SaaS catalog existed.
-- Zero is a placeholder: the platform admin must configure commercial prices.
INSERT INTO "platform_plans" ("code", "nombre", "descripcion", "priceCents", "cycleDays")
SELECT DISTINCT t."plan", t."plan", 'Plan heredado; configurar precio antes de cobrar', 0, 30
FROM "tenants" AS t
WHERE t."plan" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "platform_plans" AS p WHERE p."code" = t."plan");
