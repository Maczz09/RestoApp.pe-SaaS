-- AlterTable
ALTER TABLE "Notificacion" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Notificacion_tenantId_timestamp_idx" ON "Notificacion"("tenantId", "timestamp");
CREATE INDEX IF NOT EXISTS "Notificacion_timestamp_idx" ON "Notificacion"("timestamp");

-- AlterTable
ALTER TABLE "idempotency_keys" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idempotency_keys_tenantId_idx" ON "idempotency_keys"("tenantId");
