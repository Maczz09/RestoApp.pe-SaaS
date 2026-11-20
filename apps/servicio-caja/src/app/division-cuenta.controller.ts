import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsInt as Integer, IsNumber, IsObject, IsOptional, Max, Min } from 'class-validator';
import { Roles, RolesGuard, TenantActual } from '@org/shared-auth';
import { UsuarioActual } from '@org/observabilidad';
import { ConfigDivisionCuenta } from '@org/contracts';
import { DivisionCuentaService } from './division-cuenta.service';

export class GuardarDivisionCommand implements ConfigDivisionCuenta {
  @IsIn(['PARTES', 'ITEMS']) modo: 'PARTES' | 'ITEMS';
  @Integer() @Min(2) @Max(50) numPartes: number;
  @IsOptional() @IsObject() asignaciones?: Record<string, number>;
  @IsNumber() @Min(0) descuento: number;
  @IsNumber() @Min(0) propina: number;
  @IsOptional() @Integer() @Min(1) version?: number;
}
export class AmpliarDivisionCommand { @Integer() @Min(1) version: number; }

@Controller('division-cuenta')
@UseGuards(RolesGuard)
@Roles('ADMIN', 'SISTEMA', 'CAJERO')
export class DivisionCuentaController {
  constructor(private readonly service: DivisionCuentaService) {}
  @Get(':cuentaId')
  obtener(@Param('cuentaId') cuentaId: string, @TenantActual() tenantId?: string | null, @UsuarioActual('sedeId') sedeId?: string | null) {
    return this.service.obtener(cuentaId, tenantId, sedeId);
  }
  @Patch(':cuentaId')
  guardar(@Param('cuentaId') cuentaId: string, @Body() body: GuardarDivisionCommand, @TenantActual() tenantId?: string | null, @UsuarioActual('sedeId') sedeId?: string | null) {
    return this.service.guardar(cuentaId, body, tenantId, sedeId);
  }
  @Delete(':cuentaId')
  eliminar(@Param('cuentaId') cuentaId: string, @TenantActual() tenantId?: string | null, @UsuarioActual('sedeId') sedeId?: string | null) {
    return this.service.eliminar(cuentaId, tenantId, sedeId);
  }
  @Post(':cuentaId/ampliar')
  ampliar(@Param('cuentaId') cuentaId: string, @Body() body: AmpliarDivisionCommand, @TenantActual() tenantId?: string | null, @UsuarioActual('sedeId') sedeId?: string | null) {
    return this.service.ampliar(cuentaId, body.version, tenantId, sedeId);
  }
}
