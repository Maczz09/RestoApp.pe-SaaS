import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MesasHttpClient } from './mesas-http.client';

/** Signed branch context also bounds legacy rows created before tenantId was written. */
@Injectable()
export class PedidoTenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService, private readonly mesas: MesasHttpClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    // Existing service tokens are consumed by internal projection endpoints only.
    if (user?.rol === 'PLATFORM_ADMIN' && req.method === 'GET' && req.params?.tenantId) return true;
    if (!user?.tenantId) throw new ForbiddenException('Se requiere un restaurante activo');
    const sedeId = user.activeSedeId ?? user.sedeId ??
      (user.allowedSedeIds?.includes(req.query?.sedeId) ? req.query.sedeId : null);
    if (!sedeId) throw new ForbiddenException('Selecciona una sede del restaurante');
    if (user.allowedSedeIds?.length && !user.allowedSedeIds.includes(sedeId)) {
      throw new ForbiddenException('Sede fuera del restaurante');
    }
    // The source module resolves branch from this signed claim before query parameters.
    req.user.sedeId = sedeId;
    const params = req.params ?? {};
    let row: { id?: string; sedeId?: string | null; tenantId?: string | null } | null | undefined;
    if (params.itemId) {
      const item = await this.prisma.pedidoItem.findUnique({ where: { id: params.itemId }, include: { pedido: true } });
      row = item?.pedido;
    } else if (params.id && req.path.includes('/anulaciones/')) {
      row = await this.prisma.anulacionAuditoria.findUnique({ where: { id: params.id } });
    } else if (params.id) {
      row = await this.prisma.pedido.findUnique({ where: { id: params.id } });
    } else if (params.mesaId || req.body?.mesaId) {
      const mesaId = params.mesaId ?? req.body.mesaId;
      row = await this.prisma.mesaLocal.findUnique({ where: { id: mesaId } }) ?? await this.mesas.obtenerMesa(mesaId);
    } else return true;
    if (!row || row.sedeId !== sedeId || (row.tenantId && row.tenantId !== user.tenantId)) {
      throw new NotFoundException('Recurso no encontrado en esta sede del restaurante');
    }
    if (req.method !== 'GET' && row.id && !row.tenantId && !req.path.includes('/anulaciones/')) {
      const pedidoId = params.itemId ? (await this.prisma.pedidoItem.findUnique({ where: { id: params.itemId } }))?.pedidoId : params.id;
      if (pedidoId) await this.prisma.pedido.update({ where: { id: pedidoId }, data: { tenantId: user.tenantId } });
    }
    return true;
  }
}
