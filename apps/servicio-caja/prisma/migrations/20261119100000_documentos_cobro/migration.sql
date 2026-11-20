CREATE TABLE "series_ticket_interno" (
  "tenantId" TEXT NOT NULL,
  "sedeId" TEXT NOT NULL,
  "correlativo" INTEGER NOT NULL,
  PRIMARY KEY ("tenantId", "sedeId")
);

CREATE TABLE "documentos_cobro" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "sedeId" TEXT NOT NULL,
  "cuentaId" TEXT NOT NULL,
  "mesaId" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "correlativo" INTEGER,
  "total" DECIMAL(10,2) NOT NULL,
  "items" JSONB NOT NULL,
  "medios" JSONB NOT NULL,
  "transaccionIds" TEXT[] NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "documentos_cobro_tenantId_sedeId_correlativo_key"
ON "documentos_cobro" ("tenantId", "sedeId", "correlativo");
CREATE INDEX "documentos_cobro_tenantId_sedeId_cuentaId_idx"
ON "documentos_cobro" ("tenantId", "sedeId", "cuentaId");
