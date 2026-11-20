import { Body, ConflictException, Controller, ForbiddenException, Injectable, Post, Req, UseGuards } from '@nestjs/common';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import { Roles, RolesGuard } from '@org/shared-auth';
import { PrismaService } from '../prisma/prisma.service';
import { mapPedidoToDto } from './pedido.mapper';

export class FusionPedidosCommand {
  @IsUUID() fusionId: string;
  @IsUUID() tenantId: string;
  @IsUUID() sedeId: string;
  @IsUUID() maestraMesaId: string;
  @IsUUID() maestraCuentaId: string;
  @IsArray() @ArrayMinSize(2) @IsUUID('all', { each: true }) mesaIds: string[];
  @IsArray() @ArrayMinSize(1) @IsUUID('all', { each: true }) cuentaIds: string[];
}

/** Every financial or production mutation shares this lock with preparation. */
export async function assertMesaSinFusion(tx: any, mesaId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'fusion:' + mesaId}))`;
  const reserva = await tx.fusionPedidoMesa.findUnique({ where: { mesaId } });
  if (reserva?.estado === 'PREPARADA') throw new ConflictException('La mesa está uniéndose; reintenta cuando termine');
}

export async function assertPedidoSinFusion(tx: any, pedidoId: string): Promise<void> {
  const pedido = await tx.pedido.findUnique({ where: { id: pedidoId }, select: { mesaId: true } });
  if (pedido) await assertMesaSinFusion(tx, pedido.mesaId);
}

@Injectable()
export class FusionPedidosService {
  constructor(private readonly prisma: PrismaService) {}

  guardMesa(tx: any, mesaId: string) { return assertMesaSinFusion(tx, mesaId); }
  guardPedido(tx: any, pedidoId: string) { return assertPedidoSinFusion(tx, pedidoId); }
  async asociarCuenta(pedidoId: string, original: string, correlativo?: string) {
    const pedido = await this.prisma.pedido.findUnique({ where: { id: pedidoId }, select: { mesaId: true } });
    if (!pedido) return;
    await this.prisma.$transaction(async tx => {
      await assertMesaSinFusion(tx, pedido.mesaId);
      const alias = await tx.fusionPedidoMesa.findUnique({ where: { mesaId: pedido.mesaId } });
      const cuentaId = alias?.estado === 'CONFIRMADA' ? alias.maestraCuentaId : original;
      await tx.pedido.updateMany({ where: { id: pedidoId }, data: { cuentaId,
        ...(cuentaId === original && correlativo ? { cuentaCorrelativo: correlativo } : {}) } });
    });
  }
  async limpiarAliasMesa(mesa: { id: string; estado?: string; grupoId?: string | null; updatedAt?: string | Date }) {
    if (mesa.estado !== 'LIBRE' || mesa.grupoId || !mesa.updatedAt) return;
    const fecha = new Date(mesa.updatedAt);
    if (!Number.isFinite(fecha.getTime())) return;
    await this.prisma.fusionPedidoMesa.deleteMany({ where: { mesaId: mesa.id, estado: 'CONFIRMADA', confirmadoAt: { lte: fecha } } });
  }
  async normalizarMesa(mesaId: string): Promise<string> {
    const alias = await this.prisma.fusionPedidoMesa.findUnique({ where: { mesaId } });
    if (alias?.estado === 'PREPARADA') throw new ConflictException('La mesa está uniéndose; reintenta cuando termine');
    return alias?.estado === 'CONFIRMADA' ? alias.maestraMesaId : mesaId;
  }
  async preparar(command: FusionPedidosCommand) {
    return this.prisma.$transaction(async (tx) => {
      for (const mesaId of [...new Set(command.mesaIds)].sort()) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'fusion:' + mesaId}))`;
        const mesa = await tx.mesaLocal.findUnique({ where: { id: mesaId } });
        if (!mesa || mesa.sedeId !== command.sedeId || (mesa.tenantId && mesa.tenantId !== command.tenantId)) throw new ConflictException('Una mesa no pertenece a la sede del restaurante');
        const existing = await tx.fusionPedidoMesa.findUnique({ where: { mesaId } });
        if (existing && existing.fusionId !== command.fusionId && existing.estado === 'PREPARADA') throw new ConflictException('Otra unión está usando esta mesa');
        await tx.fusionPedidoMesa.upsert({ where: { mesaId }, create: {
          mesaId, fusionId: command.fusionId, tenantId: command.tenantId, sedeId: command.sedeId,
          maestraMesaId: command.maestraMesaId, maestraCuentaId: command.maestraCuentaId,
        }, update: existing?.fusionId === command.fusionId ? {} : {
          fusionId: command.fusionId, tenantId: command.tenantId, sedeId: command.sedeId,
          maestraMesaId: command.maestraMesaId, maestraCuentaId: command.maestraCuentaId, estado: 'PREPARADA',
        } });
      }
      const pedidos = await tx.pedido.findMany({ where: { mesaId: { in: command.mesaIds }, sedeId: command.sedeId,
        estado: { in: ['PENDIENTE', 'EN_PREPARACION', 'LISTO', 'ENTREGADO'] } }, include: { items: true } });
      if (pedidos.some((p) => !p.cuentaId || !command.cuentaIds.includes(p.cuentaId) || (p.tenantId && p.tenantId !== command.tenantId))) throw new ConflictException('Espera a que los pedidos terminen de sincronizar sus cuentas');
      const todos = await tx.pedido.findMany({ where: { cuentaId: { in: command.cuentaIds }, sedeId: command.sedeId }, include: { items: true } });
      const huellas = Object.fromEntries(todos.map((p) => [p.id, JSON.stringify({ estado: p.estado, total: Number(p.total), items: p.items.map((i) => ({ id: i.id, estado: i.estado, cantidad: i.cantidad, precio: Number(i.precioUnitario), notas: i.notas ?? '' })).sort((a,b) => a.id.localeCompare(b.id)) })]));
      return { pedidoIds: todos.map((p) => p.id).sort(), huellas };
    });
  }

  async confirmar(command: FusionPedidosCommand) {
    return this.prisma.$transaction(async (tx) => {
      let confirmada = true;
      for (const mesaId of [...new Set(command.mesaIds)].sort()) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'fusion:' + mesaId}))`;
        const existing = await tx.fusionPedidoMesa.findUnique({ where: { mesaId } });
        if (existing?.estado !== 'CONFIRMADA') confirmada = false;
        if (!existing || existing.fusionId !== command.fusionId || existing.tenantId !== command.tenantId || existing.maestraCuentaId !== command.maestraCuentaId) throw new ConflictException('Preparación no coincide');
      }
      if (confirmada) return { estado: 'CONFIRMADA' };
      const pedidos = await tx.pedido.findMany({ where: { cuentaId: { in: command.cuentaIds }, sedeId: command.sedeId }, include: { items: true } });
      for (const pedido of pedidos) {
        if (pedido.tenantId && pedido.tenantId !== command.tenantId) throw new ConflictException('Pedido de otro restaurante');
        const actualizado = await tx.pedido.update({ where: { id: pedido.id }, data: { cuentaId: command.maestraCuentaId, tenantId: command.tenantId }, include: { items: true } });
        await tx.outboxEvent.create({ data: { tenantId: command.tenantId, routingKey: 'pedido.actualizado', payload: JSON.stringify({ pedido: mapPedidoToDto(actualizado) }), status: 'PENDING' } });
      }
      await tx.fusionPedidoMesa.updateMany({ where: { fusionId: command.fusionId }, data: { estado: 'CONFIRMADA', confirmadoAt: new Date() } });
      return { estado: 'CONFIRMADA' };
    });
  }
}

@Controller('fusiones') @UseGuards(RolesGuard) @Roles('SISTEMA')
export class FusionPedidosController {
  constructor(private readonly service: FusionPedidosService) {}
  private actor(req: any) { if (req.user?.sub !== 'servicio-mesas') throw new ForbiddenException('Solo el coordinador puede unir mesas'); }
  @Post('preparar') preparar(@Body() body: FusionPedidosCommand, @Req() req: any) { this.actor(req); return this.service.preparar(body); }
  @Post('confirmar') confirmar(@Body() body: FusionPedidosCommand, @Req() req: any) { this.actor(req); return this.service.confirmar(body); }
}
