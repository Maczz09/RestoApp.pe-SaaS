import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Object-level isolation for legacy salon endpoints as well as current ones. */
@Injectable()
export class MesaTenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}
  async canActivate(context: ExecutionContext) {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (user?.rol === 'SISTEMA' && ['servicio-pedidos', 'servicio-cuentas', 'servicio-caja'].includes(user.sub)) return true;
    if (user?.rol === 'PLATFORM_ADMIN' && user.sessionScope === 'PLATFORM' && req.method === 'GET' && req.params?.tenantId) return true;
    const tenantId = user?.tenantId, sedeId = user?.activeSedeId ?? user?.sedeId;
    if (!tenantId || !sedeId || (user.allowedSedeIds?.length && !user.allowedSedeIds.includes(sedeId))) throw new ForbiddenException('Selecciona una sede del restaurante');
    req.user.sedeId = sedeId;
    const assert = (row: { tenantId?: string | null; sedeId?: string | null } | null) => {
      if (!row || row.sedeId !== sedeId || (row.tenantId && row.tenantId !== tenantId)) throw new NotFoundException('Recurso no encontrado en esta sede del restaurante');
    };
    if (req.params?.id) {
      assert(req.path.includes('/ubicaciones/')
        ? await this.prisma.ubicacion.findUnique({ where: { id: req.params.id } })
        : await this.prisma.mesa.findUnique({ where: { id: req.params.id } }));
    }
    if (Array.isArray(req.body?.mesaIds)) {
      const ids = [...new Set<string>(req.body.mesaIds)];
      const mesas = await this.prisma.mesa.findMany({ where: { id: { in: ids } } });
      if (mesas.length !== ids.length) throw new NotFoundException('Mesa no encontrada');
      mesas.forEach(assert);
    }
    if (req.body?.ubicacionId) assert(await this.prisma.ubicacion.findUnique({ where: { id: req.body.ubicacionId } }));
    return true;
  }
}
