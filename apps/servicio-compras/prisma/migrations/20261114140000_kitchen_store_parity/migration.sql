-- CreateEnum
CREATE TYPE "MovimientoInsumoTipo" AS ENUM ('ENTRADA_COMPRA', 'ENTRADA_MANUAL', 'ENTRADA_DEVOLUCION', 'SALIDA_CONSUMO', 'SALIDA_MERMA', 'AJUSTE_CONTEO');

-- CreateTable
CREATE TABLE "movimientos_insumo" (
    "id" TEXT NOT NULL,
    "sedeId" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "tipo" "MovimientoInsumoTipo" NOT NULL,
    "delta" DECIMAL(12,3) NOT NULL,
    "stockAntes" DECIMAL(12,3) NOT NULL,
    "stockDespues" DECIMAL(12,3) NOT NULL,
    "costoUnitario" DECIMAL(12,4),
    "motivo" TEXT,
    "observacion" TEXT,
    "recepcionId" TEXT,
    "usuarioId" TEXT,
    "usuarioNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_insumo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "movimientos_insumo_sedeId_createdAt_idx" ON "movimientos_insumo"("sedeId", "createdAt");

-- CreateIndex
CREATE INDEX "movimientos_insumo_insumoId_createdAt_idx" ON "movimientos_insumo"("insumoId", "createdAt");

-- CreateIndex
CREATE INDEX "movimientos_insumo_tipo_idx" ON "movimientos_insumo"("tipo");

-- AddForeignKey
ALTER TABLE "movimientos_insumo" ADD CONSTRAINT "movimientos_insumo_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "insumos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill del saldo inicial: cada insumo con stock > 0 arranca el kardex con
-- un AJUSTE_CONTEO por lo que ya tenia registrado. Sin esto la invariante
-- "sumar delta == stockActual" nace rota para todos los insumos existentes.
INSERT INTO "movimientos_insumo" ("id", "sedeId", "insumoId", "tipo", "delta", "stockAntes", "stockDespues", "costoUnitario", "motivo", "createdAt")
SELECT
    gen_random_uuid()::text,
    i."sedeId",
    i."id",
    'AJUSTE_CONTEO',
    i."stockActual",
    0,
    i."stockActual",
    i."costoUnitario",
    'Saldo inicial al habilitar el kardex de almacen',
    CURRENT_TIMESTAMP
FROM "insumos" i
WHERE i."stockActual" <> 0;

-- AlterEnum: ingreso manual (compra del dia en el mercado, sin orden de compra).

-- CreateTable: taxonomia PROPIA del almacen de cocina, separada de las
-- categorias de venta que viven en servicio-inventario.
CREATE TABLE "categorias_insumo" (
    "id" TEXT NOT NULL,
    "sedeId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categorias_insumo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categorias_insumo_sedeId_nombre_key" ON "categorias_insumo"("sedeId", "nombre");

-- CreateIndex
CREATE INDEX "categorias_insumo_sedeId_activo_idx" ON "categorias_insumo"("sedeId", "activo");

-- AlterTable
ALTER TABLE "insumos" ADD COLUMN "categoriaId" TEXT;

-- CreateIndex
CREATE INDEX "insumos_categoriaId_idx" ON "insumos"("categoriaId");

-- AddForeignKey
ALTER TABLE "insumos" ADD CONSTRAINT "insumos_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categorias_insumo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE movimientos_insumo ADD COLUMN "tenantId" TEXT;
ALTER TABLE categorias_insumo ADD COLUMN "tenantId" TEXT;
UPDATE movimientos_insumo m SET "tenantId" = i."tenantId" FROM insumos i WHERE i.id = m."insumoId";
CREATE INDEX movimientos_insumo_tenantId_sedeId_idx ON movimientos_insumo("tenantId", "sedeId");
CREATE INDEX categorias_insumo_tenantId_sedeId_idx ON categorias_insumo("tenantId", "sedeId");
