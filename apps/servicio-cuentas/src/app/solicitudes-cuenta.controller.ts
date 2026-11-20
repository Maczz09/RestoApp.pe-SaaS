import { Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { Roles, RolesGuard } from '@org/shared-auth';
import { SolicitudesCuentaService, SolicitudCuentaActor } from './solicitudes-cuenta.service';

interface StaffRequest {
  user?: { sub?: string; nombre?: string; tenantId?: string; sedeId?: string; activeSedeId?: string; allowedSedeIds?: string[] };
}

@UseGuards(RolesGuard)
@Controller()
export class SolicitudesCuentaController {
  constructor(private readonly solicitudes: SolicitudesCuentaService) {}

  @Roles('ADMIN', 'CAJERO', 'MESERO')
  @Get('solicitudes-cuenta')
  listar(@Req() req: StaffRequest) { return this.solicitudes.listar(this.actor(req)); }

  @Roles('ADMIN', 'MESERO', 'CAJERO')
  @Post(':cuentaId/solicitar-cuenta')
  solicitar(@Param('cuentaId', ParseUUIDPipe) cuentaId: string, @Req() req: StaffRequest) {
    return this.solicitudes.solicitar(cuentaId, this.actor(req));
  }

  private actor(req: StaffRequest): SolicitudCuentaActor {
    const user = req.user;
    const sedeId = user?.activeSedeId ?? user?.sedeId;
    if (!user?.tenantId || !sedeId || !user.sub ||
      (user.allowedSedeIds?.length && !user.allowedSedeIds.includes(sedeId))) {
      throw new ForbiddenException('Selecciona una sede del restaurante para solicitar o atender cuentas');
    }
    return { tenantId: user.tenantId, sedeId, usuarioId: user.sub, nombre: user.nombre ?? 'Personal' };
  }
}
