CREATE TABLE fusion_pedido_mesas (
  "confirmadoAt" TIMESTAMP(3),
  "mesaId" TEXT PRIMARY KEY, "fusionId" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "sedeId" TEXT NOT NULL,
  "maestraMesaId" TEXT NOT NULL, "maestraCuentaId" TEXT NOT NULL, estado TEXT NOT NULL DEFAULT 'PREPARADA'
);
CREATE INDEX fusion_pedido_mesas_fusionId_idx ON fusion_pedido_mesas("fusionId");
