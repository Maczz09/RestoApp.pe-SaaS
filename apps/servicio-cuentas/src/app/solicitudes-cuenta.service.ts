import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { SolicitudCuentaDto, SolicitarCuentaResponse } from '@org/contracts';

export interface SolicitudCuentaActor {
  tenantId: string;
  sedeId: string;
  usuarioId: string;
  nombre: string;
}

@Injectable()
export class SolicitudesCuentaService {
  constructor(private readonly prisma: PrismaService) {}

  async solicitar(cuentaId: string, actor: SolicitudCuentaActor): Promise<SolicitarCuentaResponse> {
    return this.prisma.$transaction(async (tx) => {
      // Synchronize with account closure/payment; duplicate clicks keep the first request.
      await tx.$queryRaw`SELECT id FROM cuentas WHERE id = ${cuentaId}
        AND "sedeId" = ${actor.sedeId} AND ("tenantId" = ${actor.tenantId} OR "tenantId" IS NULL) FOR UPDATE`;
      const cuenta = await tx.cuenta.findUnique({ where: { id: cuentaId } });
      this.assertCuenta(cuenta, actor);
      if (cuenta!.estado !== 'ABIERTA') throw new ConflictException('La cuenta ya no está activa');
      const solicitud = await tx.solicitudCuenta.upsert({
        where: { cuentaId },
        create: { cuentaId, tenantId: actor.tenantId, sedeId: actor.sedeId, mesaId: cuenta!.mesaId,
          solicitadoPorId: actor.usuarioId, solicitadoPorNombre: actor.nombre },
        update: {},
      });
      return { id: solicitud.id, cuentaId: solicitud.cuentaId, solicitadaAt: solicitud.solicitadaAt.toISOString() };
    });
  }

  async listar(actor: SolicitudCuentaActor): Promise<SolicitudCuentaDto[]> {
    if (!actor.tenantId || !actor.sedeId) throw new NotFoundException('Se requiere un restaurante y sede activos');
    const cuentas = await this.prisma.cuenta.findMany({
      where: { sedeId: actor.sedeId, OR: [{ tenantId: actor.tenantId }, { tenantId: null }], estado: 'ABIERTA' },
    });
    if (!cuentas.length) return [];
    const solicitudes = await this.prisma.solicitudCuenta.findMany({
      where: { tenantId: actor.tenantId, sedeId: actor.sedeId, cuentaId: { in: cuentas.map((c) => c.id) } },
      orderBy: { solicitadaAt: 'asc' }, take: 200,
    });
    const porId = new Map(cuentas.map((c) => [c.id, c]));
    return solicitudes.flatMap((s) => {
      const cuenta = porId.get(s.cuentaId);
      if (!cuenta) return [];
      const pedidos = Array.isArray(cuenta.pedidos) ? cuenta.pedidos : [];
      const numerosMesa = [...new Set(pedidos.map((p: any) => p?.numeroMesa).filter((n): n is number => typeof n === 'number'))].sort((a, b) => a - b);
      const numeroMesa = (pedidos.find((p: any) => p?.mesaId === cuenta.mesaId) as any)?.numeroMesa ?? numerosMesa[0];
      return [{ id: s.id, cuentaId: cuenta.id, mesaId: cuenta.mesaId, numeroMesa, numerosMesa,
        cuentaCorrelativo: cuenta.correlativo ?? undefined, total: Number(cuenta.total),
        solicitadaAt: s.solicitadaAt.toISOString(), solicitadoPorNombre: s.solicitadoPorNombre }];
    });
  }

  private assertCuenta(cuenta: { tenantId: string | null; sedeId: string } | null, actor: SolicitudCuentaActor) {
    if (!actor.tenantId || !actor.sedeId || !cuenta || cuenta.sedeId !== actor.sedeId ||
      (cuenta.tenantId && cuenta.tenantId !== actor.tenantId)) {
      throw new NotFoundException('Cuenta no encontrada en esta sede del restaurante');
    }
  }
}
