-- Multitenant SaaS migration for servicio-caja
ALTER TABLE "transacciones" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "outbox_events" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "idempotency_keys" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "cierres_caja" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "cuentas_abiertas" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "turnos_caja" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "movimientos_caja" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "arqueos_caja" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

CREATE INDEX IF NOT EXISTS "transacciones_tenantId_idx" ON "transacciones"("tenantId");
CREATE INDEX IF NOT EXISTS "transacciones_tenantId_sedeId_createdAt_idx" ON "transacciones"("tenantId", "sedeId", "createdAt");
CREATE INDEX IF NOT EXISTS "outbox_events_tenantId_status_idx" ON "outbox_events"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "idempotency_keys_tenantId_idx" ON "idempotency_keys"("tenantId");
CREATE INDEX IF NOT EXISTS "cierres_caja_tenantId_idx" ON "cierres_caja"("tenantId");
CREATE INDEX IF NOT EXISTS "cuentas_abiertas_tenantId_idx" ON "cuentas_abiertas"("tenantId");
CREATE INDEX IF NOT EXISTS "turnos_caja_tenantId_idx" ON "turnos_caja"("tenantId");
CREATE INDEX IF NOT EXISTS "turnos_caja_tenantId_sedeId_estado_idx" ON "turnos_caja"("tenantId", "sedeId", "estado");
CREATE INDEX IF NOT EXISTS "movimientos_caja_tenantId_idx" ON "movimientos_caja"("tenantId");
CREATE INDEX IF NOT EXISTS "arqueos_caja_tenantId_idx" ON "arqueos_caja"("tenantId");
