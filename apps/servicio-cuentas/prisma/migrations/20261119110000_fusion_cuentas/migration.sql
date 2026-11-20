ALTER TYPE "CuentaEstado" ADD VALUE IF NOT EXISTS 'FUSIONADA';
CREATE TABLE cuenta_fusiones (
  id TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "sedeId" TEXT NOT NULL,
  "maestraCuentaId" TEXT NOT NULL, "maestraMesaId" TEXT NOT NULL, "cuentaIds" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE cuenta_fusion_alias ("cuentaId" TEXT PRIMARY KEY, "maestraCuentaId" TEXT NOT NULL, "fusionId" TEXT NOT NULL);
CREATE INDEX cuenta_fusion_alias_maestraCuentaId_idx ON cuenta_fusion_alias("maestraCuentaId");
