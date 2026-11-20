CREATE TABLE "solicitudes_cuenta" (
  "id" TEXT NOT NULL,
  "cuentaId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "sedeId" TEXT NOT NULL,
  "mesaId" TEXT NOT NULL,
  "solicitadoPorId" TEXT NOT NULL,
  "solicitadoPorNombre" TEXT NOT NULL,
  "solicitadaAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "solicitudes_cuenta_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "solicitudes_cuenta_cuentaId_key" ON "solicitudes_cuenta"("cuentaId");
CREATE INDEX "solicitudes_cuenta_tenantId_sedeId_solicitadaAt_idx" ON "solicitudes_cuenta"("tenantId", "sedeId", "solicitadaAt");
