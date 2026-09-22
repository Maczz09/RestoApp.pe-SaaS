-- AlterTable empresas
ALTER TABLE "empresas" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "empresas_tenantId_sedeId_idx" ON "empresas"("tenantId", "sedeId");

-- AlterTable comprobantes_pago
ALTER TABLE "comprobantes_pago" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "comprobantes_pago_tenantId_sedeId_idx" ON "comprobantes_pago"("tenantId", "sedeId");

-- AlterTable comprobantes
ALTER TABLE "comprobantes" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "comprobantes_tenantId_estado_idx" ON "comprobantes"("tenantId", "estado");

-- AlterTable outbox_events
ALTER TABLE "outbox_events" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "outbox_events_tenantId_status_idx" ON "outbox_events"("tenantId", "status");

-- AlterTable idempotency_keys
ALTER TABLE "idempotency_keys" ADD COLUMN "tenantId" TEXT;
