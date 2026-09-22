-- AlterTable
ALTER TABLE "cuentas" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "cuentas_tenantId_idx" ON "cuentas"("tenantId");

-- AlterTable
ALTER TABLE "outbox_events" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "outbox_events_tenantId_idx" ON "outbox_events"("tenantId");

-- AlterTable
ALTER TABLE "idempotency_keys" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "idempotency_keys_tenantId_idx" ON "idempotency_keys"("tenantId");
