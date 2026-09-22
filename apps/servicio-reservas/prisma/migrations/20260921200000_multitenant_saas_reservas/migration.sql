-- Multitenant SaaS migration for servicio-reservas
ALTER TABLE "Reserva" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "outbox_events" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

CREATE INDEX IF NOT EXISTS "Reserva_tenantId_idx" ON "Reserva"("tenantId");
CREATE INDEX IF NOT EXISTS "Reserva_tenantId_sedeId_fecha_idx" ON "Reserva"("tenantId", "sedeId", "fecha");
CREATE INDEX IF NOT EXISTS "outbox_events_tenantId_status_idx" ON "outbox_events"("tenantId", "status");
