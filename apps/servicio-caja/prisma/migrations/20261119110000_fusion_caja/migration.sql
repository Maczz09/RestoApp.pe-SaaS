CREATE TABLE caja_fusiones (
  id TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "sedeId" TEXT NOT NULL,
  "maestraCuentaId" TEXT NOT NULL, "cuentaIds" JSONB NOT NULL,
  estado TEXT NOT NULL DEFAULT 'PREPARADA', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE caja_fusion_reservas ("cuentaId" TEXT PRIMARY KEY, "fusionId" TEXT NOT NULL);
CREATE INDEX caja_fusion_reservas_fusionId_idx ON caja_fusion_reservas("fusionId");
CREATE TABLE caja_fusion_alias ("cuentaId" TEXT PRIMARY KEY, "maestraCuentaId" TEXT NOT NULL, "fusionId" TEXT NOT NULL);
CREATE INDEX caja_fusion_alias_maestraCuentaId_idx ON caja_fusion_alias("maestraCuentaId");
