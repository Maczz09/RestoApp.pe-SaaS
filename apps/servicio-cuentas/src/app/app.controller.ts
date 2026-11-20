import { Controller, Get, Post, Body, Param, ParseUUIDPipe, HttpCode, Query, UseGuards, Req } from '@nestjs/common';
import { Roles, RolesGuard, TenantActual } from '@org/shared-auth';
import { UsuarioActual } from '@org/observabilidad';
import { AppService } from './app.service';
import {
  AbrirCuentaCommand,
  CerrarCuentaCommand,
  DividirCuentaCommand
} from '@org/contracts';

// Cuentas: abiertas/consultadas desde el salón (mesero, recepción) y cobradas
// en caja; servicio-caja también las consulta/cierra con token SISTEMA.
@UseGuards(RolesGuard)
@Roles('ADMIN', 'SISTEMA', 'CAJERO', 'MESERO', 'RECEPCION')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  healthCheck() {
    return { status: 'OK', service: 'Cuentas' };
  }

  @Post()
  abrirCuenta(
    @Body() command: AbrirCuentaCommand,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
    @TenantActual() tenantId?: string | null,
  ) {
    return tenantId ? this.appService.abrirCuenta(command, usuarioSedeId, sedeId, 'manual', tenantId) : this.appService.abrirCuenta(command, usuarioSedeId, sedeId);
  }

  @Get('mesa/:mesaId')
  async obtenerCuentaPorMesa(@Param('mesaId', ParseUUIDPipe) mesaId: string, @Req() req?: { user?: { rol?: string; tenantId?: string; sedeId?: string } }) {
    const cuenta = await this.appService.obtenerCuentaPorMesa(mesaId);
    if (req?.user?.rol !== 'SISTEMA' && req) await this.appService.assertAccesoCuenta(cuenta.id, req.user?.tenantId, req.user?.sedeId);
    return cuenta;
  }

  // Uso interno (servicio-caja, token SISTEMA): registrado antes de ':id'
  // para que 'abiertas' no se intente parsear como UUID de cuenta.
  @Roles('SISTEMA')
  @Get('abiertas')
  listarCuentasAbiertasPorSede(@Query('sedeId') sedeId: string) {
    return this.appService.listarCuentasAbiertasPorSede(sedeId);
  }

  @Get(':id')
  async obtenerCuenta(@Param('id', ParseUUIDPipe) id: string, @Req() req?: { user?: { rol?: string; tenantId?: string; sedeId?: string } }) {
    if (req?.user?.rol !== 'SISTEMA' && req) await this.appService.assertAccesoCuenta(id, req.user?.tenantId, req.user?.sedeId);
    return this.appService.obtenerCuenta(id);
  }

  @HttpCode(200)
  @Post(':id/dividir')
  async dividirCuenta(@Param('id', ParseUUIDPipe) id: string, @Body() command: DividirCuentaCommand, @Req() req?: { user?: { rol?: string; tenantId?: string; sedeId?: string } }) {
    if (req?.user?.rol !== 'SISTEMA' && req) await this.appService.assertAccesoCuenta(id, req.user?.tenantId, req.user?.sedeId);
    return this.appService.dividirCuenta(id, command);
  }

  @Roles('SISTEMA')
  @Post(':id/cerrar')
  async cerrarCuenta(@Param('id', ParseUUIDPipe) id: string, @Body() command: CerrarCuentaCommand, @Req() req?: { user?: { rol?: string; tenantId?: string; sedeId?: string } }) {
    if (req?.user?.rol !== 'SISTEMA' && req) await this.appService.assertAccesoCuenta(id, req.user?.tenantId, req.user?.sedeId);
    return this.appService.cerrarCuenta(id, command);
  }

  // Uso interno (servicio-pedidos, token SISTEMA): cascada cuando todos los
  // ítems de la atención quedan anulados sin cobro (ver AppService.cancelarCuenta).
  @Roles('SISTEMA')
  @Post(':id/cancelar')
  cancelarCuenta(@Param('id', ParseUUIDPipe) id: string) {
    return this.appService.cancelarCuenta(id);
  }
}
