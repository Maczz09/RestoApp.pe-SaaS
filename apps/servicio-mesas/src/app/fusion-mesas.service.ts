import { Body, ConflictException, Controller, ForbiddenException, Injectable, NotFoundException, Post, Req, UseGuards } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ServiceTokenService, Roles, RolesGuard } from '@org/shared-auth';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { AppService } from './app.service';

export class UnirMesasOcupadasCommand {
  @IsArray() @ArrayMinSize(2) @IsUUID('all', { each: true }) mesaIds: string[];
  @IsUUID() maestraMesaId: string;
}

@Injectable()
export class FusionMesasService {
  constructor(private readonly prisma: PrismaService, private readonly tokens: ServiceTokenService, private readonly mesas: AppService) {}

  private async remoto(service: 'caja' | 'cuentas' | 'pedidos', route: string, data: unknown): Promise<any> {
    // Each service validates its own command with forbidNonWhitelisted.
    const fields = service === 'caja' ? ['fusionId', 'tenantId', 'sedeId', 'maestraCuentaId', 'cuentaIds']
      : service === 'cuentas' ? ['fusionId', 'tenantId', 'sedeId', 'maestraMesaId', 'maestraCuentaId', 'cuentaIds', 'pedidoIds', 'huellas']
      : ['fusionId', 'tenantId', 'sedeId', 'maestraMesaId', 'maestraCuentaId', 'mesaIds', 'cuentaIds'];
    const body = Object.fromEntries(fields.map(key => [key, (data as Record<string, unknown>)[key]]));
    const url = process.env[`${service.toUpperCase()}_SERVICE_URL`] ?? `http://servicio-${service}:3000/api`;
    const token = this.tokens.generateServiceToken('servicio-mesas', `servicio-${service}`);
    return (await axios.post(`${url}/fusiones/${route}`, body, { timeout: 15_000, headers: { Authorization: `Bearer ${token}` } })).data;
  }

  async unir(command: UnirMesasOcupadasCommand, tenantId: string, sedeId: string, actorId: string) {
    if (!tenantId || !sedeId || !actorId) throw new ForbiddenException('Selecciona restaurante y sede');
    const ids = [...new Set(command.mesaIds)].sort();
    if (ids.length < 2 || !ids.includes(command.maestraMesaId)) throw new ConflictException('Selecciona dos mesas y una principal incluida');
    const fusionId = await this.prisma.$transaction(async (tx) => {
      for (const id of ids) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'fusion:' + id}))`;
      const mesas = await tx.mesa.findMany({ where: { id: { in: ids } } });
      if (mesas.length !== ids.length || mesas.some((m) => m.sedeId !== sedeId || (m.tenantId && m.tenantId !== tenantId) || m.numero >= 90 || m.estado === 'RESERVADA')) throw new NotFoundException('Selecciona mesas físicas disponibles en la misma sede del restaurante');
      if (mesas.some((m) => m.grupoId && m.grupoId !== command.maestraMesaId)) throw new ConflictException('Selecciona el grupo completo o separa primero las mesas');
      const reservas = await tx.fusionMesaReserva.findMany({ where: { mesaId: { in: ids } } });
      if (reservas.length) {
        const active = await tx.fusionMesas.findUnique({ where: { id: reservas[0].fusionId } });
        if (!active || active.tenantId !== tenantId || active.sedeId !== sedeId || active.maestraMesaId !== command.maestraMesaId || JSON.stringify(active.mesaIds) !== JSON.stringify(ids)) throw new ConflictException('Ya hay una unión distinta en curso');
        return active.id;
      }
      const maestra = mesas.find((m) => m.id === command.maestraMesaId)!;
      const cuentaIds = [...new Set(mesas.map((m) => m.cuentaAsociada).filter((id): id is string => Boolean(id)))].sort();
      if (!maestra.cuentaAsociada || cuentaIds.length < 2) throw new ConflictException('Para consolidar cuentas elige dos mesas ocupadas y una principal con cuenta');
      const created = await tx.fusionMesas.create({ data: { tenantId, sedeId, actorId, maestraMesaId: maestra.id,
        maestraCuentaId: maestra.cuentaAsociada, mesaIds: ids, cuentaIds } });
      for (const mesaId of ids) await tx.fusionMesaReserva.create({ data: { mesaId, fusionId: created.id } });
      return created.id;
    });
    await this.avanzar(fusionId);
    return this.resultado(fusionId);
  }

  private payload(f: any) { return { fusionId: f.id, tenantId: f.tenantId, sedeId: f.sedeId,
    maestraMesaId: f.maestraMesaId, maestraCuentaId: f.maestraCuentaId, mesaIds: f.mesaIds, cuentaIds: f.cuentaIds }; }

  async avanzar(id: string): Promise<void> {
    for (let attempt = 0; attempt < 7; attempt++) {
      const fusion = await this.prisma.fusionMesas.findUnique({ where: { id } });
      if (!fusion || ['COMPLETADA', 'RECHAZADA'].includes(fusion.estado)) return;
      const payload = this.payload(fusion);
      try {
        let next: string;
        if (fusion.estado === 'PENDIENTE') {
          await this.remoto('caja', 'preparar', payload); next = 'CAJA';
        } else if (fusion.estado === 'CAJA') {
          const prepared = await this.remoto('pedidos', 'preparar', payload);
          await this.prisma.fusionMesas.updateMany({ where: { id, estado: 'CAJA' }, data: { estado: 'PEDIDOS', pedidoIds: prepared.pedidoIds, huellas: prepared.huellas, ultimoError: null } });
          continue;
        } else if (fusion.estado === 'PEDIDOS') {
          await this.remoto('cuentas', 'confirmar', { ...payload, pedidoIds: fusion.pedidoIds, huellas: fusion.huellas }); next = 'CUENTAS';
        } else if (fusion.estado === 'CUENTAS') {
          await this.remoto('pedidos', 'confirmar', payload); next = 'PEDIDOS_CONFIRMADOS';
        } else if (fusion.estado === 'PEDIDOS_CONFIRMADOS') {
          await this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM fusiones_mesas WHERE id = ${id} FOR UPDATE`;
            const actual = await tx.fusionMesas.findUnique({ where: { id } });
            if (actual?.estado !== 'PEDIDOS_CONFIRMADOS') return;
            await tx.$executeRaw`SELECT set_config('app.fusion_id', ${id}, true)`;
            for (const mesaId of fusion.mesaIds as string[]) {
              const mesa = await tx.mesa.update({ where: { id: mesaId }, data: { tenantId: fusion.tenantId, grupoId: fusion.maestraMesaId, estado: 'OCUPADA', cuentaAsociada: fusion.maestraCuentaId }, include: { ubicacion: true } });
              await tx.outboxEvent.create({ data: { tenantId: fusion.tenantId, routingKey: 'mesa.actualizada', status: 'PENDING', payload: JSON.stringify({ mesa: { ...mesa, ubicacion: mesa.ubicacion.nombre, createdAt: mesa.createdAt.toISOString(), updatedAt: mesa.updatedAt.toISOString() } }) } });
            }
            await tx.fusionMesas.update({ where: { id }, data: { estado: 'MESAS', ultimoError: null } });
          });
          continue;
        } else if (fusion.estado === 'MESAS') {
          await this.remoto('caja', 'confirmar', payload);
          await this.prisma.$transaction(async (tx) => {
            await tx.fusionMesas.update({ where: { id }, data: { estado: 'COMPLETADA', ultimoError: null } });
            await tx.fusionMesaReserva.deleteMany({ where: { fusionId: id } });
          });
          return;
        } else throw new ConflictException('Estado de unión desconocido');
        await this.prisma.fusionMesas.updateMany({ where: { id, estado: fusion.estado }, data: { estado: next, ultimoError: null } });
      } catch (error: any) {
        const message = error.response?.data?.message ?? error.message;
        // Only a definitive rejection BEFORE any other service is changed is terminal.
        if (fusion.estado === 'PENDIENTE' && [400, 403, 404, 409].includes(error.response?.status)) {
          await this.prisma.$transaction(async (tx) => {
            await tx.fusionMesas.updateMany({ where: { id, estado: 'PENDIENTE' }, data: { estado: 'RECHAZADA', ultimoError: String(message) } });
            await tx.fusionMesaReserva.deleteMany({ where: { fusionId: id } });
          });
          throw new ConflictException(String(message));
        }
        await this.prisma.fusionMesas.updateMany({ where: { id, estado: fusion.estado }, data: { ultimoError: String(message) } });
        // Durable phase + original IDs remain for automatic retry; do not undo committed money state.
        return;
      }
    }
  }

  private async resultado(id: string) {
    const fusion = await this.prisma.fusionMesas.findUniqueOrThrow({ where: { id } });
    const result = await this.mesas.listarMesas(fusion.sedeId, undefined, fusion.tenantId);
    return { fusionId: id, estado: fusion.estado, message: fusion.estado === 'COMPLETADA' ? 'Mesas y cuentas unidas' : 'Unión guardada; se completará al recuperar la conexión',
      mesas: result.mesas.filter((m) => (fusion.mesaIds as string[]).includes(m.id)) };
  }

  @Cron('*/30 * * * * *') async reintentar() {
    const pending = await this.prisma.fusionMesas.findMany({ where: { estado: { notIn: ['COMPLETADA', 'RECHAZADA'] } }, orderBy: { updatedAt: 'asc' }, take: 10 });
    for (const fusion of pending) { try { await this.avanzar(fusion.id); } catch { /* error retained in the durable record */ } }
  }
}

@Controller('fusiones') @UseGuards(RolesGuard) @Roles('ADMIN', 'CAJERO', 'MESERO')
export class FusionMesasController {
  constructor(private readonly service: FusionMesasService) {}
  @Post() unir(@Body() body: UnirMesasOcupadasCommand, @Req() req: any) {
    return this.service.unir(body, req.user?.tenantId, req.user?.sedeId, req.user?.sub);
  }
}
