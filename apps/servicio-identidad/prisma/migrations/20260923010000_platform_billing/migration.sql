CREATE TABLE "platform_plans" (
  "code" TEXT NOT NULL PRIMARY KEY,
  "nombre" TEXT NOT NULL,
  "descripcion" TEXT,
  "priceCents" INTEGER NOT NULL,
  "cycleDays" INTEGER NOT NULL DEFAULT 30,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "platform_plans" ("code", "nombre", "descripcion", "priceCents", "cycleDays") VALUES
  ('BASICO', 'Básico', 'Plan inicial para restaurantes pequeños', 0, 30),
  ('ESTANDAR', 'Estándar', 'Operación completa de restaurante', 0, 30),
  ('PRO', 'Pro', 'Operación avanzada y múltiples sedes', 0, 30);

ALTER TABLE "tenants" ADD COLUMN "nextDueAt" TIMESTAMP(3);
UPDATE "tenants" SET "nextDueAt" = "createdAt" + INTERVAL '30 days';

CREATE TABLE "platform_payments" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "planCode" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "periods" INTEGER NOT NULL,
  "dueBefore" TIMESTAMP(3) NOT NULL,
  "dueAfter" TIMESTAMP(3) NOT NULL,
  "method" TEXT NOT NULL,
  "reference" TEXT,
  "note" TEXT,
  "recordedBy" TEXT NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_payments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "platform_payments_tenantId_paidAt_idx" ON "platform_payments"("tenantId", "paidAt");
