-- AlterTable proveedores
ALTER TABLE "proveedores" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "proveedores_tenantId_sedeId_idx" ON "proveedores"("tenantId", "sedeId");

-- AlterTable insumos
ALTER TABLE "insumos" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "insumos_tenantId_sedeId_idx" ON "insumos"("tenantId", "sedeId");

-- AlterTable ordenes_compra
ALTER TABLE "ordenes_compra" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "ordenes_compra_tenantId_sedeId_idx" ON "ordenes_compra"("tenantId", "sedeId");

-- AlterTable recepciones_compra
ALTER TABLE "recepciones_compra" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "recepciones_compra_tenantId_sedeId_idx" ON "recepciones_compra"("tenantId", "sedeId");

-- AlterTable comprobantes_compra
ALTER TABLE "comprobantes_compra" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "comprobantes_compra_tenantId_sedeId_idx" ON "comprobantes_compra"("tenantId", "sedeId");

-- AlterTable outbox_events
ALTER TABLE "outbox_events" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "outbox_events_tenantId_status_idx" ON "outbox_events"("tenantId", "status");

-- AlterTable idempotency_keys
ALTER TABLE "idempotency_keys" ADD COLUMN "tenantId" TEXT;
