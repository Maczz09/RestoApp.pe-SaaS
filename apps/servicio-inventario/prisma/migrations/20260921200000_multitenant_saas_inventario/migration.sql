-- Multitenant SaaS migration for servicio-inventario
ALTER TABLE "categorias" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "tamanos_plato" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "mermas" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "menu_diario" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "outbox_events" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "idempotency_keys" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

CREATE INDEX IF NOT EXISTS "categorias_tenantId_idx" ON "categorias"("tenantId");
CREATE INDEX IF NOT EXISTS "categorias_tenantId_sedeId_idx" ON "categorias"("tenantId", "sedeId");
CREATE INDEX IF NOT EXISTS "tamanos_plato_tenantId_idx" ON "tamanos_plato"("tenantId");
CREATE INDEX IF NOT EXISTS "tamanos_plato_tenantId_sedeId_orden_idx" ON "tamanos_plato"("tenantId", "sedeId", "orden");
CREATE INDEX IF NOT EXISTS "productos_tenantId_idx" ON "productos"("tenantId");
CREATE INDEX IF NOT EXISTS "productos_tenantId_sedeId_idx" ON "productos"("tenantId", "sedeId");
CREATE INDEX IF NOT EXISTS "mermas_tenantId_idx" ON "mermas"("tenantId");
CREATE INDEX IF NOT EXISTS "menu_diario_tenantId_idx" ON "menu_diario"("tenantId");
CREATE INDEX IF NOT EXISTS "outbox_events_tenantId_status_idx" ON "outbox_events"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "idempotency_keys_tenantId_idx" ON "idempotency_keys"("tenantId");
