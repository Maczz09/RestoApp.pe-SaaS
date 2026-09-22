-- AlterTable
ALTER TABLE "ventas_diarias" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ventas_diarias_tenantId_fecha_idx" ON "ventas_diarias"("tenantId", "fecha");
CREATE INDEX IF NOT EXISTS "ventas_diarias_tenantId_sedeId_fecha_idx" ON "ventas_diarias"("tenantId", "sedeId", "fecha");
CREATE INDEX IF NOT EXISTS "ventas_diarias_tenantId_meseroId_idx" ON "ventas_diarias"("tenantId", "meseroId");

-- AlterTable
ALTER TABLE "idempotency_keys" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idempotency_keys_tenantId_idx" ON "idempotency_keys"("tenantId");
