CREATE TABLE "division_cuentas" (
  "id" TEXT PRIMARY KEY, "cuentaId" TEXT NOT NULL UNIQUE,
  "tenantId" TEXT NOT NULL, "sedeId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1, "modo" TEXT NOT NULL,
  "config" JSONB NOT NULL, "unidades" JSONB NOT NULL,
  "totalCentimos" INTEGER NOT NULL, "descuentoCentimos" INTEGER NOT NULL,
  "propinaCentimos" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "division_cuentas_tenantId_sedeId_idx" ON "division_cuentas"("tenantId", "sedeId");
CREATE TABLE "division_partes" (
  "id" TEXT PRIMARY KEY, "divisionId" TEXT NOT NULL REFERENCES "division_cuentas"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "indice" INTEGER NOT NULL, "label" TEXT NOT NULL,
  "montoCentimos" INTEGER NOT NULL, "propinaCentimos" INTEGER NOT NULL,
  "unidades" JSONB NOT NULL, "items" JSONB NOT NULL,
  "pagada" BOOLEAN NOT NULL DEFAULT false, "transaccionIds" JSONB NOT NULL DEFAULT '[]',
  "pagadaAt" TIMESTAMP(3), UNIQUE("divisionId", "indice")
);
ALTER TABLE "transacciones" ADD COLUMN "divisionParteId" TEXT;
ALTER TABLE "transacciones" ADD CONSTRAINT "transacciones_divisionParteId_fkey"
  FOREIGN KEY ("divisionParteId") REFERENCES "division_partes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
