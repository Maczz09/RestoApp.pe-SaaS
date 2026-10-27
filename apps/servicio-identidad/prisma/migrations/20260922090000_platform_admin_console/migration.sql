-- Consola de plataforma: dominios administrables, datos de contacto y auditoría trazable.
ALTER TABLE "tenant_domains"
  ADD COLUMN "activo" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "principal" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Cada tenant tiene como máximo un dominio principal. Los datos previos se
-- normalizan antes de crear el índice parcial.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "tenantId" ORDER BY "createdAt", id) AS rn
  FROM "tenant_domains"
)
UPDATE "tenant_domains" AS d
SET "principal" = true
FROM ranked
WHERE d.id = ranked.id AND ranked.rn = 1;

CREATE UNIQUE INDEX "tenant_domains_one_primary_per_tenant"
  ON "tenant_domains"("tenantId")
  WHERE "principal" = true;

ALTER TABLE "Usuario" ADD COLUMN "telefono" TEXT;
ALTER TABLE "sedes" ADD COLUMN "telefono" TEXT;

ALTER TABLE "AuditoriaLog"
  ADD COLUMN "recurso" TEXT,
  ADD COLUMN "recursoId" TEXT,
  ADD COLUMN "detalle" TEXT,
  ADD COLUMN "resultado" TEXT NOT NULL DEFAULT 'OK';

CREATE INDEX "AuditoriaLog_tenantId_createdAt_idx"
  ON "AuditoriaLog"("tenantId", "createdAt" DESC);
