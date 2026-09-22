-- AlterTable
ALTER TABLE "mesas" ADD COLUMN "tenantId" TEXT;

-- DropIndex
DROP INDEX IF EXISTS "mesas_sedeId_numero_key";

-- CreateIndex
CREATE INDEX "mesas_tenantId_idx" ON "mesas"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "mesas_tenantId_sedeId_numero_key" ON "mesas"("tenantId", "sedeId", "numero");

-- AlterTable
ALTER TABLE "ubicaciones" ADD COLUMN "tenantId" TEXT;

-- DropIndex
DROP INDEX IF EXISTS "ubicaciones_sedeId_nombre_key";

-- CreateIndex
CREATE INDEX "ubicaciones_tenantId_idx" ON "ubicaciones"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ubicaciones_tenantId_sedeId_nombre_key" ON "ubicaciones"("tenantId", "sedeId", "nombre");

-- AlterTable
ALTER TABLE "outbox_events" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "outbox_events_tenantId_idx" ON "outbox_events"("tenantId");

-- AlterTable
ALTER TABLE "idempotency_keys" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "idempotency_keys_tenantId_idx" ON "idempotency_keys"("tenantId");
