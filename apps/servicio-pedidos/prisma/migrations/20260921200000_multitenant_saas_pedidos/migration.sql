-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "pedidos_tenantId_idx" ON "pedidos"("tenantId");

-- AlterTable
ALTER TABLE "pedido_items" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "pedido_items_tenantId_idx" ON "pedido_items"("tenantId");

-- AlterTable
ALTER TABLE "mesas_local" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "mesas_local_tenantId_idx" ON "mesas_local"("tenantId");

-- AlterTable
ALTER TABLE "outbox_events" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "outbox_events_tenantId_idx" ON "outbox_events"("tenantId");

-- AlterTable
ALTER TABLE "productos_locales" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "productos_locales_tenantId_idx" ON "productos_locales"("tenantId");

-- AlterTable
ALTER TABLE "idempotency_keys" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "idempotency_keys_tenantId_idx" ON "idempotency_keys"("tenantId");
