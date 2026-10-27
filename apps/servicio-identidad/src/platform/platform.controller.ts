import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ActualizarTenantDomainCommand,
  ActualizarTenantPlataformaCommand,
  CambiarEstadoTenantCommand,
  CrearTenantDomainCommand,
  CrearTenantPlataformaCommand,
  ListarAuditoriaPlataformaQuery,
  ListarTenantsPlataformaQuery,
} from '@org/contracts';
import { JwtAuthGuard } from '@org/shared-auth';
import { PlatformAdminGuard } from './platform-admin.guard';
import { PlatformService } from './platform.service';
import { PlatformBillingService, type PlanInput, type PaymentInput } from './platform-billing.service';
import { PlatformUsersService } from './platform-users.service';

interface PlatformRequest extends Request {
  user: {
    sub: string;
    rol: 'PLATFORM_ADMIN';
    sessionScope: 'PLATFORM';
    tenantId: null;
  };
}

@Controller('platform')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class PlatformController {
  constructor(private readonly platformService: PlatformService, private readonly billing: PlatformBillingService, private readonly users: PlatformUsersService) {}

  @Get('admins')
  listarAdmins() { return this.users.list(); }

  @Post('admins')
  crearAdmin(@Body() input: { nombre: string; email: string; password: string }, @Req() req: PlatformRequest) { return this.users.create(input, req.user.sub); }

  @Patch('admins/:id/estado')
  cambiarAdminEstado(@Param('id') userId: string, @Body() input: { activo: boolean }, @Req() req: PlatformRequest) { return this.users.setStatus(userId, input.activo, req.user.sub); }

  @Patch('admins/:id/password')
  cambiarAdminClave(@Param('id') userId: string, @Body() input: { password: string }, @Req() req: PlatformRequest) { return this.users.resetPassword(userId, input.password, req.user.sub); }

  @Get('plans')
  listarPlanes() { return this.billing.listPlans(); }

  @Post('plans')
  crearPlan(@Body() input: PlanInput, @Req() req: PlatformRequest) { return this.billing.createPlan(input, req.user.sub); }

  @Patch('plans/:code')
  actualizarPlan(@Param('code') code: string, @Body() input: PlanInput, @Req() req: PlatformRequest) { return this.billing.updatePlan(code, input, req.user.sub); }

  @Get('billing')
  listarCobros() { return this.billing.listBilling(); }

  @Get('tenants/:id/payments')
  listarPagos(@Param('id') tenantId: string) { return this.billing.listPayments(tenantId); }

  @Post('tenants/:id/payments')
  registrarPago(@Param('id') tenantId: string, @Body() input: PaymentInput, @Req() req: PlatformRequest) { return this.billing.recordPayment(tenantId, input, req.user.sub); }

  @Patch('tenants/:id/due-date')
  ajustarVencimiento(@Param('id') tenantId: string, @Body() input: { nextDueAt: string }, @Req() req: PlatformRequest) { return this.billing.setDueDate(tenantId, input.nextDueAt, req.user.sub); }

  @Get('summary')
  resumen() {
    return this.platformService.resumen();
  }

  @Get('tenants')
  listarTenants(@Query() query: ListarTenantsPlataformaQuery) {
    return this.platformService.listarTenants(query);
  }

  @Get('tenants/:id')
  obtenerTenant(@Param('id') tenantId: string) {
    return this.platformService.obtenerTenant(tenantId);
  }

  @Post('tenants/:id/observe/start')
  iniciarObservacion(@Param('id') tenantId: string, @Req() req: PlatformRequest) {
    return this.platformService.iniciarObservacion(tenantId, req.user.sub, req.ip);
  }

  @Get('tenants/:id/observe')
  observacion(@Param('id') tenantId: string) {
    return this.platformService.observacion(tenantId);
  }

  @Post('tenants')
  crearTenant(
    @Body() command: CrearTenantPlataformaCommand,
    @Req() req: PlatformRequest,
  ) {
    return this.platformService.crearTenant(command, req.user.sub, req.ip);
  }

  @Patch('tenants/:id')
  actualizarTenant(
    @Param('id') tenantId: string,
    @Body() command: ActualizarTenantPlataformaCommand,
    @Req() req: PlatformRequest,
  ) {
    return this.platformService.actualizarTenant(tenantId, command, req.user.sub, req.ip);
  }

  @Patch('tenants/:id/estado')
  cambiarEstado(
    @Param('id') tenantId: string,
    @Body() command: CambiarEstadoTenantCommand,
    @Req() req: PlatformRequest,
  ) {
    return this.platformService.cambiarEstadoTenant(tenantId, command, req.user.sub, req.ip);
  }

  @Get('tenants/:id/domains')
  listarDomains(@Param('id') tenantId: string) {
    return this.platformService.listarDomains(tenantId);
  }

  @Post('tenants/:id/domains')
  crearDomain(
    @Param('id') tenantId: string,
    @Body() command: CrearTenantDomainCommand,
    @Req() req: PlatformRequest,
  ) {
    return this.platformService.crearDomain(tenantId, command, req.user.sub, req.ip);
  }

  @Patch('tenants/:id/domains/:domainId')
  actualizarDomain(
    @Param('id') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() command: ActualizarTenantDomainCommand,
    @Req() req: PlatformRequest,
  ) {
    return this.platformService.actualizarDomain(
      tenantId,
      domainId,
      command,
      req.user.sub,
      req.ip,
    );
  }

  @Delete('tenants/:id/domains/:domainId')
  eliminarDomain(
    @Param('id') tenantId: string,
    @Param('domainId') domainId: string,
    @Req() req: PlatformRequest,
  ) {
    return this.platformService.eliminarDomain(tenantId, domainId, req.user.sub, req.ip);
  }

  @Get('tenants/:id/auditoria')
  listarAuditoria(
    @Param('id') tenantId: string,
    @Query() query: ListarAuditoriaPlataformaQuery,
  ) {
    return this.platformService.listarAuditoria(tenantId, query);
  }
}
