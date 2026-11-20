import { Body, ConflictException, Controller, ForbiddenException, Injectable, Post, Req, UseGuards } from '@nestjs/common';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import { Roles, RolesGuard } from '@org/shared-auth';
import { PrismaService } from '../prisma/prisma.service';

export class FusionCajaCommand {
  @IsUUID() fusionId: string;
  @IsUUID() tenantId: string;
  @IsUUID() sedeId: string;
  @IsUUID() maestraCuentaId: string;
  @IsArray() @ArrayMinSize(1) @IsUUID('all', { each: true }) cuentaIds: string[];
}

/** Called inside registrarPago's account advisory lock, before any writes. */
export async function assertCuentaNoBloqueada(tx: any, cuentaId: string): Promise<void> {
  const [reserva, alias] = await Promise.all([
    tx.cajaFusionReserva.findUnique({ where: { cuentaId } }),
    tx.cajaFusionAlias.findUnique({ where: { cuentaId } }),
  ]);
  if (alias) throw new ConflictException('Cuenta FUSIONADA: cobra desde la mesa principal');
  if (reserva) throw new ConflictException('La cuenta se está uniendo; espera a que termine la operación');
}

export async function cuentaIdsParaSaldo(tx: any, cuentaId: string): Promise<string[]> {
  const alias = await tx.cajaFusionAlias.findMany({ where: { maestraCuentaId: cuentaId } });
  return [cuentaId, ...alias.map((a: any) => a.cuentaId)];
}

@Injectable()
export class CajaFusionService {
  constructor(private readonly prisma: PrismaService) {}

  async preparar(command: FusionCajaCommand) {
    const ids = [...new Set(command.cuentaIds)].sort();
    if (!ids.includes(command.maestraCuentaId)) throw new ConflictException('La cuenta principal debe estar en la selección');
    return this.prisma.$transaction(async (tx) => {
      for (const id of ids) await tx.$executeRaw`SELECT pg_advisory_xact_lock(1234, ('x' || substr(md5(${id}), 1, 8))::bit(32)::int)`;
      const existing = await tx.cajaFusion.findUnique({ where: { id: command.fusionId } });
      if (existing) {
        if (existing.tenantId !== command.tenantId || existing.sedeId !== command.sedeId || existing.maestraCuentaId !== command.maestraCuentaId || JSON.stringify(existing.cuentaIds) !== JSON.stringify(ids)) throw new ConflictException('La operación ya existe con otros datos');
        return { estado: existing.estado };
      }
      for (const id of ids) {
        const reserva = await tx.cajaFusionReserva.findUnique({ where: { cuentaId: id } });
        if (reserva) throw new ConflictException('Otra unión está usando una de estas cuentas');
        const projection = await tx.cuentaAbierta.findUnique({ where: { cuentaId: id } });
        if (!projection || projection.sedeId !== command.sedeId || (projection.tenantId && projection.tenantId !== command.tenantId) || projection.estado !== 'ABIERTA') throw new ConflictException('Cuenta no disponible en este restaurante y sede');
      }
      // Fail closed until a separate ledger migration can preserve allocated
      // discounts/tips of partially paid accounts without rewriting history.
      const pagos = await tx.transaccion.count({ where: { cuentaId: { in: ids } } });
      const pendientes = await tx.pagoPendiente.count({ where: { cuentaId: { in: ids }, estado: { in: ['PENDIENTE', 'PROCESANDO'] } } });
      const division = await tx.divisionCuenta.count({ where: { cuentaId: { in: ids } } });
      if (division) throw new ConflictException('Hay una división guardada; elimínala antes de unir cuentas');
      if (pagos || pendientes) throw new ConflictException('No se pueden unir cuentas con pagos o cobros pendientes; conserva sus cobros separados');
      await tx.cajaFusion.create({ data: { id: command.fusionId, tenantId: command.tenantId, sedeId: command.sedeId, maestraCuentaId: command.maestraCuentaId, cuentaIds: ids } });
      for (const cuentaId of ids) await tx.cajaFusionReserva.create({ data: { cuentaId, fusionId: command.fusionId } });
      return { estado: 'PREPARADA' };
    });
  }

  async confirmar(command: FusionCajaCommand) {
    return this.prisma.$transaction(async (tx) => {
      for (const id of [...new Set(command.cuentaIds)].sort()) await tx.$executeRaw`SELECT pg_advisory_xact_lock(1234, ('x' || substr(md5(${id}), 1, 8))::bit(32)::int)`;
      const fusion = await tx.cajaFusion.findUnique({ where: { id: command.fusionId } });
      if (!fusion || fusion.tenantId !== command.tenantId || fusion.sedeId !== command.sedeId || fusion.maestraCuentaId !== command.maestraCuentaId || JSON.stringify(fusion.cuentaIds) !== JSON.stringify([...new Set(command.cuentaIds)].sort())) throw new ConflictException('La operación no coincide con la preparación');
      if (fusion.estado === 'CONFIRMADA') return { estado: 'CONFIRMADA' };
      for (const id of command.cuentaIds.filter((id) => id !== command.maestraCuentaId)) {
        await tx.cajaFusionAlias.create({ data: { cuentaId: id, maestraCuentaId: command.maestraCuentaId, fusionId: command.fusionId } });
        await tx.cuentaAbierta.update({ where: { cuentaId: id }, data: { estado: 'FUSIONADA' } });
      }
      await tx.cajaFusionReserva.deleteMany({ where: { fusionId: command.fusionId } });
      await tx.cajaFusion.update({ where: { id: fusion.id }, data: { estado: 'CONFIRMADA' } });
      return { estado: 'CONFIRMADA' };
    });
  }
}

@Controller('fusiones')
@UseGuards(RolesGuard)
@Roles('SISTEMA')
export class CajaFusionController {
  constructor(private readonly service: CajaFusionService) {}
  private actor(req: { user?: { sub?: string } }) {
    if (!['servicio-mesas', 'servicio-cuentas'].includes(req.user?.sub ?? '')) throw new ForbiddenException('Solo el coordinador interno puede unir cuentas');
  }
  @Post('preparar') preparar(@Body() body: FusionCajaCommand, @Req() req: any) { this.actor(req); return this.service.preparar(body); }
  @Post('confirmar') confirmar(@Body() body: FusionCajaCommand, @Req() req: any) { this.actor(req); return this.service.confirmar(body); }
}
