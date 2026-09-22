import { IsEmail, IsString, IsEnum, IsBoolean, IsNotEmpty, MinLength, IsOptional, IsInt, Min, Max, IsArray, ValidateNested, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export const RolUsuario = {
  PlatformAdmin: 'PLATFORM_ADMIN',
  Admin: 'ADMIN',
  Cajero: 'CAJERO',
  Cocina: 'COCINA',
  Mesero: 'MESERO',
  Recepcion: 'RECEPCION',
  Gerencia: 'GERENCIA',
  Sistema: 'SISTEMA',
} as const;

export type RolUsuario = (typeof RolUsuario)[keyof typeof RolUsuario];

/* ── DTOs ────────────────────────────────────────────── */

export class UsuarioDto {
  @IsString()
  id: string;

  @IsString()
  nombre: string;

  @IsEmail()
  email: string;

  @IsEnum(RolUsuario)
  rol: RolUsuario;

  @IsBoolean()
  activo: boolean;

  // T-23 (multi-sede): null = admin general (sin sede fija).
  @IsOptional()
  @IsString()
  sedeId?: string | null;

  @IsOptional()
  @IsString()
  telefono?: string | null;

  @IsString()
  createdAt: string;
}

/* ── Queries ─────────────────────────────────────────── */

export class ListarUsuariosQuery {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsEnum(RolUsuario)
  rol?: RolUsuario;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsDateString()
  updatedSince?: string;

  @IsOptional()
  @IsString()
  sedeId?: string;
}

/* ── Commands ────────────────────────────────────────── */

export class LoginCommand {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

export class CrearUsuarioCommand {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsEnum(RolUsuario)
  rol: RolUsuario;

  // Requerida salvo rol ADMIN (validado en el servicio: un ADMIN queda sin
  // sede fija — administra la que elija).
  @IsOptional()
  @IsString()
  sedeId?: string;

  @IsOptional()
  @IsString()
  telefono?: string;
}

export class CambiarRolCommand {
  @IsEnum(RolUsuario)
  rol: RolUsuario;
}

export class CambiarEstadoUsuarioCommand {
  @IsBoolean()
  activo: boolean;
}

// Teléfono editable por un ADMIN — separado de CrearUsuarioCommand porque
// esto se usa para editar un usuario YA existente (mismo criterio que
// CambiarRolCommand/CambiarEstadoUsuarioCommand: un comando angosto por
// mutación, no un "update" genérico).
export class ActualizarUsuarioCommand {
  @IsOptional()
  @IsString()
  telefono?: string | null;
}

// Reseteo de contraseña por un ADMIN (no requiere la contraseña actual del
// usuario — a diferencia de un self-service "cambiar mi contraseña", que
// no existe todavía). Separado de ActualizarUsuarioCommand porque es una
// acción sensible con su propio registro de auditoría.
export class CambiarPasswordUsuarioCommand {
  @IsString()
  @MinLength(8)
  password: string;
}

/* ── Responses ───────────────────────────────────────── */

export class LoginResponseDto {
  @IsString()
  access_token: string;
  
  usuario: Omit<UsuarioDto, 'activo' | 'createdAt'>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserTenantSummaryDto)
  tenants?: UserTenantSummaryDto[];

  @IsOptional()
  @IsString()
  activeTenantId?: string | null;

  @IsOptional()
  @IsString()
  activeSedeId?: string | null;
}

export class UsuarioListResponse {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UsuarioDto)
  data: UsuarioDto[];

  @IsOptional()
  @IsString()
  nextCursor: string | null;
}

/* ── Sedes (T-23: multi-sede) ────────────────────────── */

export class SedeDto {
  @IsString()
  id: string;

  @IsString()
  nombre: string;

  @IsOptional()
  @IsString()
  direccion?: string | null;

  // RUC fiscal de la sede, impreso en la boleta de venta interna. Puede
  // repetirse entre sedes de un mismo cliente (misma razón social) — no es
  // unique a propósito, decisión del admin.
  @IsOptional()
  @IsString()
  ruc?: string | null;

  // Opcional, de relleno — se muestra en la carta pública (T-XX). Sin
  // validación de formato a propósito, el dueño solo quiere poder rellenarlo.
  @IsOptional()
  @IsString()
  telefono?: string | null;

  @IsBoolean()
  activa: boolean;
}

export class CrearSedeCommand {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsOptional()
  @IsString()
  direccion?: string;

  @IsOptional()
  @IsString()
  ruc?: string;

  @IsOptional()
  @IsString()
  telefono?: string;
}

export class ActualizarSedeCommand {
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsString()
  direccion?: string | null;

  @IsOptional()
  @IsString()
  ruc?: string | null;

  @IsOptional()
  @IsString()
  telefono?: string | null;

  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}

export class SedesResponse {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SedeDto)
  sedes: SedeDto[];
}

/**
 * Datos de sede expuestos SIN autenticación (carta pública/QR — T-XX). Solo
 * lo estrictamente necesario para el header de la carta: nada de ruc, ni
 * `activa` (una sede inactiva simplemente no responde, ver AuthService.sedePublica).
 */
export class SedePublicaDto {
  @IsString()
  id: string;

  @IsString()
  nombre: string;

  @IsOptional()
  @IsString()
  direccion?: string | null;

  @IsOptional()
  @IsString()
  telefono?: string | null;
}

export class SedePublicaResponse {
  @IsOptional()
  @ValidateNested()
  @Type(() => SedePublicaDto)
  sede: SedePublicaDto | null;
}

/* ── SaaS Multitenant (Tenants & Membresías) ────────────── */

export class TenantDto {
  @IsString()
  id: string;

  @IsString()
  nombre: string;

  @IsString()
  slug: string;

  @IsOptional()
  @IsString()
  ruc?: string | null;

  @IsBoolean()
  activo: boolean;

  @IsString()
  plan: string;

  @IsString()
  createdAt: string;
}

export class MembresiaDto {
  @IsString()
  id: string;

  @IsString()
  tenantId: string;

  @IsString()
  usuarioId: string;

  @IsString()
  rol: string;

  @IsBoolean()
  activo: boolean;

  @IsOptional()
  @IsString()
  permisos?: string | null;

  @IsOptional()
  @IsArray()
  sedes?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => TenantDto)
  tenant?: TenantDto;
}

export class OnboardingCommand {
  @IsString()
  @IsNotEmpty()
  nombreRestaurante: string;

  @IsString()
  @IsNotEmpty()
  slugRestaurante: string;

  @IsOptional()
  @IsString()
  rucRestaurante?: string;

  @IsString()
  @IsNotEmpty()
  nombreSede: string;

  @IsOptional()
  @IsString()
  direccionSede?: string;

  @IsString()
  @IsNotEmpty()
  nombreUsuario: string;

  @IsEmail()
  emailUsuario: string;

  @IsString()
  @MinLength(8)
  passwordUsuario: string;
}

export class SelectTenantCommand {
  @IsString()
  @IsNotEmpty()
  tenantId: string;

  @IsOptional()
  @IsString()
  sedeId?: string;
}

export class UserTenantSummaryDto {
  @ValidateNested()
  @Type(() => TenantDto)
  tenant: TenantDto;

  @IsString()
  membershipId: string;

  @IsString()
  rol: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SedeDto)
  sedes: SedeDto[];
}
