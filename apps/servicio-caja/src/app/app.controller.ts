import { Controller, Get, Post, Patch, Body, Query, Param, UseGuards, UseInterceptors } from '@nestjs/common';
import { Roles, RolesGuard, TenantActual } from '@org/shared-auth';
import { IdempotencyInterceptor } from '@org/resiliencia';
import { AppService } from './app.service';
import { ListarTransaccionesQuery, ListarTurnosQuery, TransaccionListResponse, TurnoListResponse } from '@org/contracts';
import { UsuarioActual } from '@org/observabilidad';
import {
  AbrirTurnoCajaCommand,
  ActualizarTransaccionCommand,
  CerrarTurnoCajaCommand,
  CrearMovimientoCajaCommand,
  PagarCuentaCajaCommand,
  RegistrarArqueoCajaCommand,
} from './caja.dto';

// Caja: operada por el cajero; admin/sistema con acceso total.
@UseGuards(RolesGuard)
@Roles('ADMIN', 'SISTEMA', 'CAJERO')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // /api/health lo sirve el HealthController compartido (@org/observabilidad).

  // Idempotencia HTTP (plan 1.3): evita pagos duplicados por doble-click/retry.
  @UseInterceptors(IdempotencyInterceptor)
  @Post('pagos')
  registrarPago(
    @Body() body: PagarCuentaCajaCommand,
    @UsuarioActual() usuarioId: string | null,
    @UsuarioActual('nombre') usuarioNombre: string | null,
    @UsuarioActual('email') usuarioEmail: string | null,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @TenantActual() tenantId?: string | null,
  ) {
    if (tenantId !== undefined) {
      return this.appService.registrarPago(
        body,
        usuarioId,
        usuarioNombre ?? usuarioEmail ?? usuarioId,
        usuarioSedeId,
        tenantId,
      );
    }
    return this.appService.registrarPago(
      body,
      usuarioId,
      usuarioNombre ?? usuarioEmail ?? usuarioId,
      usuarioSedeId,
    );
  }

  @Get()
  listarTransacciones(
    @Query() query: ListarTransaccionesQuery,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @TenantActual() tenantId?: string | null,
  ): Promise<TransaccionListResponse> {
    if (tenantId !== undefined) {
      return this.appService.listarTransacciones(query, usuarioSedeId, tenantId);
    }
    return this.appService.listarTransacciones(query, usuarioSedeId);
  }

  @Post('turnos/abrir')
  abrirTurno(
    @Body() body: AbrirTurnoCajaCommand,
    @UsuarioActual() usuarioId: string | null,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
    @TenantActual() tenantId?: string | null,
  ) {
    if (tenantId !== undefined) {
      return this.appService.abrirTurno(body, usuarioId, usuarioSedeId, sedeId, tenantId);
    }
    return this.appService.abrirTurno(body, usuarioId, usuarioSedeId, sedeId);
  }

  // Historial de turnos (p.ej. cierres de caja pasados) — solo admin/sistema.
  @Roles('ADMIN', 'SISTEMA')
  @Get('turnos')
  listarTurnos(
    @Query() query: ListarTurnosQuery,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @TenantActual() tenantId?: string | null,
  ): Promise<TurnoListResponse> {
    if (tenantId !== undefined) {
      return this.appService.listarTurnos(query, usuarioSedeId, tenantId);
    }
    return this.appService.listarTurnos(query, usuarioSedeId);
  }

  @Get('turnos/activo')
  obtenerTurnoActivo(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    @UsuarioActual() _usuarioId: string | null,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
    @TenantActual() tenantId?: string | null,
  ) {
    if (tenantId !== undefined) {
      return this.appService.obtenerTurnoActivo(usuarioSedeId, sedeId, tenantId);
    }
    return this.appService.obtenerTurnoActivo(usuarioSedeId, sedeId);
  }

  @Get('turnos/activo/resumen')
  obtenerResumenTurnoActivo(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    @UsuarioActual() _usuarioId: string | null,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
    @TenantActual() tenantId?: string | null,
  ) {
    if (tenantId !== undefined) {
      return this.appService.obtenerResumenTurnoActivo(usuarioSedeId, sedeId, tenantId);
    }
    return this.appService.obtenerResumenTurnoActivo(usuarioSedeId, sedeId);
  }

  @Get('turnos/:id/resumen')
  obtenerResumenTurno(
    @Param('id') id: string,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @TenantActual() tenantId?: string | null,
  ) {
    if (tenantId !== undefined) {
      return this.appService.obtenerResumenTurno(id, usuarioSedeId, tenantId);
    }
    return this.appService.obtenerResumenTurno(id, usuarioSedeId);
  }

  @Get('turnos/:id/movimientos')
  listarMovimientosTurno(
    @Param('id') id: string,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @TenantActual() tenantId?: string | null,
  ) {
    if (tenantId !== undefined) {
      return this.appService.listarMovimientosTurno(id, usuarioSedeId, tenantId);
    }
    return this.appService.listarMovimientosTurno(id, usuarioSedeId);
  }

  @Post('turnos/:id/movimientos')
  crearMovimiento(
    @Param('id') id: string,
    @Body() body: CrearMovimientoCajaCommand,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @TenantActual() tenantId?: string | null,
  ) {
    if (tenantId !== undefined) {
      return this.appService.crearMovimiento(id, body, usuarioSedeId, tenantId);
    }
    return this.appService.crearMovimiento(id, body, usuarioSedeId);
  }

  @Post('turnos/:id/arqueo')
  registrarArqueo(
    @Param('id') id: string,
    @Body() body: RegistrarArqueoCajaCommand,
    @UsuarioActual() usuarioId: string | null,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @TenantActual() tenantId?: string | null,
  ) {
    if (tenantId !== undefined) {
      return this.appService.registrarArqueo(id, body, usuarioId, usuarioSedeId, tenantId);
    }
    return this.appService.registrarArqueo(id, body, usuarioId, usuarioSedeId);
  }

  @Post('turnos/:id/cerrar')
  cerrarTurno(
    @Param('id') id: string,
    @Body() body: CerrarTurnoCajaCommand,
    @UsuarioActual() usuarioId: string | null,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @TenantActual() tenantId?: string | null,
  ) {
    if (tenantId !== undefined) {
      return this.appService.cerrarTurno(id, body, usuarioId, usuarioSedeId, tenantId);
    }
    return this.appService.cerrarTurno(id, body, usuarioId, usuarioSedeId);
  }

  // Detalle/edición de una transacción — después de las rutas 'turnos/*'
  // para que ':id' no las capture (mismo orden de ruteo que el resto).
  @Get(':id')
  obtenerTransaccion(
    @Param('id') id: string,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @TenantActual() tenantId?: string | null,
  ) {
    if (tenantId !== undefined) {
      return this.appService.obtenerTransaccion(id, usuarioSedeId, tenantId);
    }
    return this.appService.obtenerTransaccion(id, usuarioSedeId);
  }

  @Patch(':id')
  actualizarTransaccion(
    @Param('id') id: string,
    @Body() body: ActualizarTransaccionCommand,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @TenantActual() tenantId?: string | null,
  ) {
    if (tenantId !== undefined) {
      return this.appService.actualizarTransaccion(id, body, usuarioSedeId, tenantId);
    }
    return this.appService.actualizarTransaccion(id, body, usuarioSedeId);
  }
}
