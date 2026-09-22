-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ruc" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "plan" TEXT NOT NULL DEFAULT 'ESTANDAR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_domains" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membresias" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "rol" TEXT NOT NULL DEFAULT 'MESERO',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "permisos" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membresias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membresias_sedes" (
    "id" TEXT NOT NULL,
    "membresiaId" TEXT NOT NULL,
    "sedeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membresias_sedes_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "sedes" ADD COLUMN "tenantId" TEXT;

-- DropIndex
DROP INDEX IF EXISTS "sedes_nombre_key";

-- AlterTable
ALTER TABLE "AuditoriaLog" ADD COLUMN "tenantId" TEXT;

-- AlterTable
ALTER TABLE "outbox_events" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_domains_domain_key" ON "tenant_domains"("domain");

-- CreateIndex
CREATE INDEX "tenant_domains_tenantId_idx" ON "tenant_domains"("tenantId");

-- CreateIndex
CREATE INDEX "membresias_usuarioId_idx" ON "membresias"("usuarioId");

-- CreateIndex
CREATE INDEX "membresias_tenantId_idx" ON "membresias"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "membresias_tenantId_usuarioId_key" ON "membresias"("tenantId", "usuarioId");

-- CreateIndex
CREATE INDEX "membresias_sedes_sedeId_idx" ON "membresias_sedes"("sedeId");

-- CreateIndex
CREATE UNIQUE INDEX "membresias_sedes_membresiaId_sedeId_key" ON "membresias_sedes"("membresiaId", "sedeId");

-- CreateIndex
CREATE INDEX "sedes_tenantId_idx" ON "sedes"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "sedes_tenantId_nombre_key" ON "sedes"("tenantId", "nombre");

-- CreateIndex
CREATE INDEX "AuditoriaLog_tenantId_idx" ON "AuditoriaLog"("tenantId");

-- CreateIndex
CREATE INDEX "outbox_events_tenantId_idx" ON "outbox_events"("tenantId");

-- AddForeignKey
ALTER TABLE "tenant_domains" ADD CONSTRAINT "tenant_domains_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresias" ADD CONSTRAINT "membresias_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresias" ADD CONSTRAINT "membresias_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresias_sedes" ADD CONSTRAINT "membresias_sedes_membresiaId_fkey" FOREIGN KEY ("membresiaId") REFERENCES "membresias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresias_sedes" ADD CONSTRAINT "membresias_sedes_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "sedes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sedes" ADD CONSTRAINT "sedes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
