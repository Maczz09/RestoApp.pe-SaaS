import { Body, ConflictException, Controller, ForbiddenException, Injectable, Post, Req, UseGuards } from '@nestjs/common';
import { ArrayMinSize, IsArray, IsObject, IsUUID } from 'class-validator';
import { Roles, RolesGuard } from '@org/shared-auth';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma';

export class FusionCuentasCommand {
  @IsUUID() fusionId: string;
  @IsUUID() tenantId: string;
  @IsUUID() sedeId: string;
  @IsUUID() maestraMesaId: string;
  @IsUUID() maestraCuentaId: string;
  @IsArray() @ArrayMinSize(1) @IsUUID('all', { each: true }) cuentaIds: string[];
  @IsArray() @IsUUID('all', { each: true }) pedidoIds: string[];
  @IsObject() huellas: Record<string,string>;
}

@Injectable()
export class CuentaFusionService {
  constructor(private readonly prisma: PrismaService) {}

  async fusionar(command: FusionCuentasCommand) {
    const ids = [...new Set(command.cuentaIds)].sort();
    if (!ids.includes(command.maestraCuentaId)) throw new ConflictException('La cuenta principal no está seleccionada');
    return this.prisma.$transaction(async (tx) => {
      const cuentas = await tx.cuenta.findMany({ where: { id: { in: ids } } });
      for (const mesaId of [...new Set(cuentas.map((c) => c.mesaId))].sort()) await tx.$executeRaw`SELECT pg_advisory_xact_lock(1234, ('x' || substr(md5(${mesaId}), 1, 8))::bit(32)::int)`;
      const existing = await tx.cuentaFusion.findUnique({ where: { id: command.fusionId } });
      if (existing) {
        if (existing.tenantId !== command.tenantId || existing.sedeId !== command.sedeId || existing.maestraMesaId !== command.maestraMesaId || existing.maestraCuentaId !== command.maestraCuentaId || JSON.stringify(existing.cuentaIds) !== JSON.stringify(ids)) throw new ConflictException('La operación ya tiene otros datos');
        return { estado: 'CONFIRMADA' };
      }
      // Re-read under all account/mesa locks, never use the pre-lock snapshot.
      const actuales = await tx.cuenta.findMany({ where: { id: { in: ids } } });
      if (actuales.length !== ids.length || actuales.some((c) => c.estado !== 'ABIERTA' || c.sedeId !== command.sedeId || (c.tenantId && c.tenantId !== command.tenantId))) throw new ConflictException('Las cuentas deben estar abiertas en la misma sede y restaurante');
      const snapshots = new Map<string, any>();
      for (const cuenta of actuales) {
        if (!Array.isArray(cuenta.pedidos)) throw new ConflictException('Cuenta con historial inválido');
        for (const pedido of cuenta.pedidos as any[]) {
          if (snapshots.has(pedido.id)) throw new ConflictException('Un pedido está registrado en dos cuentas');
          snapshots.set(pedido.id, pedido);
        }
      }
      const huella = (p: any) => JSON.stringify({ estado: p.estado, total: Number(p.total), items: (p.items ?? []).map((i: any) => ({ id: i.id, estado: i.estado, cantidad: i.cantidad, precio: Number(i.precioUnitario), notas: i.notas ?? '' })).sort((a:any,b:any) => a.id.localeCompare(b.id)) });
      if (snapshots.size !== command.pedidoIds.length || command.pedidoIds.some((id) => !snapshots.has(id) || command.huellas[id] !== huella(snapshots.get(id)))) throw new ConflictException('Espera la sincronización completa de los pedidos antes de unir');
      const total = actuales.reduce((sum, c) => sum.plus(c.total), new Prisma.Decimal(0));
      await tx.cuenta.update({ where: { id: command.maestraCuentaId }, data: {
        tenantId: command.tenantId, mesaId: command.maestraMesaId, pedidos: [...snapshots.values()] as Prisma.InputJsonValue, total,
      } });
      for (const cuenta of actuales.filter((c) => c.id !== command.maestraCuentaId)) {
        await tx.cuenta.update({ where: { id: cuenta.id }, data: { estado: 'FUSIONADA', tenantId: command.tenantId } });
        // Preserve original snapshots, totals and timestamps for historical reads.
        await tx.cuentaFusionAlias.create({ data: { cuentaId: cuenta.id, maestraCuentaId: command.maestraCuentaId, fusionId: command.fusionId } });
      }
      await tx.cuentaFusion.create({ data: { id: command.fusionId, tenantId: command.tenantId, sedeId: command.sedeId,
        maestraCuentaId: command.maestraCuentaId, maestraMesaId: command.maestraMesaId, cuentaIds: ids } });
      const maestra = actuales.find((c) => c.id === command.maestraCuentaId)!;
      for (const pedido of snapshots.values()) await tx.outboxEvent.create({ data: {
        tenantId: command.tenantId, routingKey: 'cuenta.asociada', status: 'PENDING',
        payload: JSON.stringify({ tenantId: command.tenantId, pedidoId: pedido.id, cuentaId: command.maestraCuentaId, sedeId: command.sedeId, correlativo: maestra.correlativo ?? undefined }),
      } });
      return { estado: 'CONFIRMADA' };
    });
  }
}

@Controller('fusiones') @UseGuards(RolesGuard) @Roles('SISTEMA')
export class CuentaFusionController {
  constructor(private readonly service: CuentaFusionService) {}
  @Post('confirmar') confirmar(@Body() body: FusionCuentasCommand, @Req() req: any) {
    if (req.user?.sub !== 'servicio-mesas') throw new ForbiddenException('Solo el coordinador puede unir cuentas');
    return this.service.fusionar(body);
  }
}
