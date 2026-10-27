import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  ActualizarTenantDomainCommand,
  ActualizarTenantPlataformaCommand,
  CambiarEstadoTenantCommand,
  CrearTenantDomainCommand,
  CrearTenantPlataformaCommand,
  ListarAuditoriaPlataformaQuery,
  ListarTenantsPlataformaQuery,
  PlatformAuditListResponse,
  PlatformSummaryDto,
  PlatformTenantDto,
  PlatformTenantListResponse,
  SedeDto,
  TenantDomainDto,
} from '@org/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { RESERVED_PLATFORM_SUBDOMAINS, tenantBaseDomain } from '@org/shared-auth';

const SALT_ROUNDS = 12;
const DEFAULT_PLAN = 'ESTANDAR';
const HOSTNAME_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

type DomainRow = {
  id: string;
  tenantId: string;
  domain: string;
  activo: boolean;
  principal: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type TenantView = {
  id: string;
  nombre: string;
  slug: string;
  ruc: string | null;
  activo: boolean;
  plan: string;
  createdAt: Date;
  updatedAt: Date;
  dominios: DomainRow[];
  membresias: Array<{
    usuario: {
      id: string;
      nombre: string;
      email: string;
      activo: boolean;
    };
  }>;
  _count: { sedes: number; membresias: number };
};

@Injectable()
export class PlatformService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeLimit(limit?: number): number {
    const parsed = Number(limit ?? 20);
    if (!Number.isFinite(parsed)) return 20;
    return Math.min(Math.max(Math.trunc(parsed), 1), 100);
  }

  private normalizeSlug(slug: string): string {
    const value = slug.trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || value.length < 3 || value.length > 63) {
      throw new BadRequestException('El slug solo admite minúsculas, números y guiones simples');
    }
    if (RESERVED_PLATFORM_SUBDOMAINS.has(value)) throw new BadRequestException('El slug está reservado para la plataforma');
    return value;
  }

  private normalizeDomain(domain: string): string {
    let value = domain.trim().toLowerCase().replace(/\.$/, '');
    if (/^https?:\/\//.test(value)) {
      try {
        const parsed = new URL(value);
        if (parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.port) {
          throw new Error('not-host-only');
        }
        value = parsed.hostname;
      } catch {
        throw new BadRequestException('El dominio debe ser un hostname sin ruta ni puerto');
      }
    }
    if (!HOSTNAME_PATTERN.test(value) || value === 'localhost') {
      throw new BadRequestException('El dominio no es válido');
    }

    const baseDomain = tenantBaseDomain();
    const reserved = new Set([
      baseDomain,
      ...Array.from(RESERVED_PLATFORM_SUBDOMAINS, (slug) => `${slug}.${baseDomain}`),
    ]);
    if (reserved.has(value)) {
      throw new BadRequestException('El dominio está reservado para la plataforma');
    }
    return value;
  }

  private defaultDomain(slug: string): string {
    const baseDomain = tenantBaseDomain();
    return this.normalizeDomain(`${slug}.${baseDomain}`);
  }

  private toDomainDto(domain: DomainRow): TenantDomainDto {
    return {
      id: domain.id,
      tenantId: domain.tenantId,
      domain: domain.domain,
      activo: domain.activo,
      principal: domain.principal,
      createdAt: domain.createdAt.toISOString(),
      updatedAt: domain.updatedAt.toISOString(),
    };
  }

  private toTenantDto(tenant: TenantView): PlatformTenantDto {
    const admin = tenant.membresias[0]?.usuario ?? null;
    return {
      id: tenant.id,
      nombre: tenant.nombre,
      slug: tenant.slug,
      ruc: tenant.ruc,
      activo: tenant.activo,
      plan: tenant.plan,
      createdAt: tenant.createdAt.toISOString(),
      updatedAt: tenant.updatedAt.toISOString(),
      domains: tenant.dominios.map((domain) => this.toDomainDto(domain)),
      sedesCount: tenant._count.sedes,
      usuariosCount: tenant._count.membresias,
      admin: admin
        ? { id: admin.id, nombre: admin.nombre, email: admin.email, activo: admin.activo }
        : null,
    };
  }

  private tenantInclude() {
    return {
      dominios: { orderBy: [{ principal: 'desc' as const }, { createdAt: 'asc' as const }] },
      membresias: {
        where: { rol: 'ADMIN', activo: true },
        orderBy: { createdAt: 'asc' as const },
        take: 1,
        include: { usuario: true },
      },
      _count: { select: { sedes: true, membresias: true } },
    };
  }

  private async getTenantOrThrow(tenantId: string): Promise<TenantView> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: this.tenantInclude(),
    });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');
    return tenant as TenantView;
  }

  async resumen(): Promise<PlatformSummaryDto> {
    const [tenants, totalSedes, totalUsuarios, totalDomains] = await Promise.all([
      this.prisma.tenant.findMany({
        select: {
          activo: true,
          sedes: { where: { activa: true }, select: { id: true } },
          dominios: { where: { activo: true }, select: { id: true, principal: true } },
          membresias: {
            where: { activo: true, rol: 'ADMIN', usuario: { activo: true } },
            select: { id: true },
          },
        },
      }),
      this.prisma.sede.count({ where: { activa: true } }),
      this.prisma.membresia.count({ where: { activo: true } }),
      this.prisma.tenantDomain.count({ where: { activo: true } }),
    ]);

    const tenantsEnOnboarding = tenants.filter(
      (tenant) => tenant.sedes.length === 0 || tenant.membresias.length === 0,
    ).length;
    const tenantsConIncidencias = tenants.filter(
      (tenant) =>
        tenant.activo &&
        (tenant.membresias.length === 0 ||
          !tenant.dominios.some((domain) => domain.principal)),
    ).length;

    return {
      totalTenants: tenants.length,
      tenantsActivos: tenants.filter((tenant) => tenant.activo).length,
      tenantsSuspendidos: tenants.filter((tenant) => !tenant.activo).length,
      tenantsEnOnboarding,
      tenantsConIncidencias,
      totalSedes,
      totalUsuarios,
      totalDomains,
    };
  }

  async listarTenants(
    query: ListarTenantsPlataformaQuery = {},
  ): Promise<PlatformTenantListResponse> {
    const limit = this.normalizeLimit(query.limit);
    const search = query.search?.trim();
    const tenants = await this.prisma.tenant.findMany({
      where: {
        ...(query.estado ? { activo: query.estado === 'ACTIVO' } : {}),
        ...(query.plan ? { plan: query.plan } : {}),
        ...(search
          ? {
              OR: [
                { nombre: { contains: search, mode: 'insensitive' as const } },
                { slug: { contains: search, mode: 'insensitive' as const } },
                { ruc: { contains: search } },
              ],
            }
          : {}),
      },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: this.tenantInclude(),
    });
    const hasMore = tenants.length > limit;
    const page = tenants.slice(0, limit) as TenantView[];
    return {
      data: page.map((tenant) => this.toTenantDto(tenant)),
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
    };
  }

  async obtenerTenant(tenantId: string): Promise<PlatformTenantDto> {
    return this.toTenantDto(await this.getTenantOrThrow(tenantId));
  }

  async iniciarObservacion(tenantId: string, actorId: string, ip?: string) {
    await this.getTenantOrThrow(tenantId);
    await this.prisma.auditoriaLog.create({ data: {
      tenantId, accion: 'PLATFORM_OBSERVACION_INICIADA', usuarioId: actorId,
      servicio: 'servicio-identidad', recurso: 'Tenant', recursoId: tenantId,
      detalle: JSON.stringify({ modo: 'SOLO_LECTURA' }), ip,
    } });
    return { started: true, tenantId };
  }

  async observacion(tenantId: string) {
    const tenant = await this.getTenantOrThrow(tenantId);
    const [sedes, usuarios, audit] = await Promise.all([
      this.prisma.sede.findMany({ where: { tenantId }, select: { id: true, nombre: true, direccion: true, ruc: true, activa: true }, orderBy: { nombre: 'asc' } }),
      this.prisma.membresia.findMany({ where: { tenantId, activo: true }, select: { rol: true, usuario: { select: { id: true, nombre: true, email: true, activo: true } } }, take: 200 }),
      this.prisma.auditoriaLog.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, accion: true, servicio: true, detalle: true, resultado: true, createdAt: true } }),
    ]);
    return { tenant: this.toTenantDto(tenant), sedes, usuarios, audit, observedAt: new Date().toISOString() };
  }

  async crearTenant(
    command: CrearTenantPlataformaCommand,
    actorId: string,
    ip?: string,
  ): Promise<{
    tenant: PlatformTenantDto;
    sede: SedeDto | null;
    administrador: { id: string; nombre: string; email: string; activo: boolean };
  }> {
    const slug = this.normalizeSlug(command.slug);
    const domain = this.normalizeDomain(command.domain ?? this.defaultDomain(slug));
    const email = command.administrador.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(command.administrador.password, SALT_ROUNDS);
    const planCode = command.plan?.trim().toUpperCase() || DEFAULT_PLAN;
    const selectedPlan = await this.prisma.platformPlan.findUnique({ where: { code: planCode } });
    if (!selectedPlan?.activo) throw new BadRequestException('Selecciona un plan activo');

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const [tenantExists, domainExists, userExists] = await Promise.all([
          tx.tenant.findUnique({ where: { slug } }),
          tx.tenantDomain.findUnique({ where: { domain } }),
          tx.usuario.findUnique({ where: { email } }),
        ]);
        if (tenantExists) throw new ConflictException('El slug ya está en uso');
        if (domainExists) throw new ConflictException('El dominio ya está en uso');
        if (userExists) throw new ConflictException('Ya existe un usuario con el correo del administrador');

        const tenant = await tx.tenant.create({
          data: {
            nombre: command.nombre.trim(),
            slug,
            ruc: command.ruc?.trim() || null,
            plan: planCode,
            nextDueAt: new Date(Date.now() + selectedPlan.cycleDays * 86_400_000),
          },
        });
        await tx.tenantDomain.create({
          data: { tenantId: tenant.id, domain, activo: true, principal: true },
        });
        const sede = command.sede
          ? await tx.sede.create({
              data: {
                tenantId: tenant.id,
                nombre: command.sede.nombre.trim(),
                direccion: command.sede.direccion?.trim() || null,
                ruc: command.sede.ruc?.trim() || command.ruc?.trim() || null,
                telefono: command.sede.telefono?.trim() || null,
              },
            })
          : null;
        const usuario = await tx.usuario.create({
          data: {
            nombre: command.administrador.nombre.trim(),
            email,
            password: passwordHash,
            rol: 'ADMIN',
            telefono: command.administrador.telefono?.trim() || null,
            sedeId: null,
          },
        });
        const membresia = await tx.membresia.create({
          data: { tenantId: tenant.id, usuarioId: usuario.id, rol: 'ADMIN', activo: true },
        });
        if (sede) {
          await tx.membresiaSede.create({
            data: { membresiaId: membresia.id, sedeId: sede.id },
          });
        }
        await tx.auditoriaLog.create({
          data: {
            tenantId: tenant.id,
            accion: 'PLATFORM_TENANT_CREADO',
            usuarioId: actorId,
            servicio: 'servicio-identidad',
            recurso: 'Tenant',
            recursoId: tenant.id,
            detalle: JSON.stringify({ slug, domain, plan: tenant.plan, adminEmail: email }),
            resultado: 'OK',
            ip,
          },
        });
        return { tenantId: tenant.id, sede, usuario };
      });

      return {
        tenant: await this.obtenerTenant(created.tenantId),
        sede: created.sede
          ? {
              id: created.sede.id,
              nombre: created.sede.nombre,
              direccion: created.sede.direccion,
              ruc: created.sede.ruc,
              telefono: created.sede.telefono,
              activa: created.sede.activa,
            }
          : null,
        administrador: {
          id: created.usuario.id,
          nombre: created.usuario.nombre,
          email: created.usuario.email,
          activo: created.usuario.activo,
        },
      };
    } catch (error) {
      if (error instanceof ConflictException || error instanceof BadRequestException) throw error;
      if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
        throw new ConflictException('El slug, dominio o correo ya está en uso');
      }
      throw error;
    }
  }

  async actualizarTenant(
    tenantId: string,
    command: ActualizarTenantPlataformaCommand,
    actorId: string,
    ip?: string,
  ): Promise<PlatformTenantDto> {
    await this.getTenantOrThrow(tenantId);
    const slug = command.slug ? this.normalizeSlug(command.slug) : undefined;
    if (command.plan) {
      const selectedPlan = await this.prisma.platformPlan.findUnique({ where: { code: command.plan.trim().toUpperCase() } });
      if (!selectedPlan?.activo) throw new BadRequestException('Selecciona un plan activo');
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.tenant.update({
          where: { id: tenantId },
          data: {
            nombre: command.nombre?.trim(),
            slug,
            ruc: command.ruc === null ? null : command.ruc?.trim(),
            plan: command.plan?.trim().toUpperCase(),
          },
        });
        await tx.auditoriaLog.create({
          data: {
            tenantId,
            accion: 'PLATFORM_TENANT_ACTUALIZADO',
            usuarioId: actorId,
            servicio: 'servicio-identidad',
            recurso: 'Tenant',
            recursoId: tenantId,
            detalle: JSON.stringify(command),
            resultado: 'OK',
            ip,
          },
        });
      });
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
        throw new ConflictException('El slug ya está en uso');
      }
      throw error;
    }
    return this.obtenerTenant(tenantId);
  }

  async cambiarEstadoTenant(
    tenantId: string,
    command: CambiarEstadoTenantCommand,
    actorId: string,
    ip?: string,
  ): Promise<PlatformTenantDto> {
    const tenant = await this.getTenantOrThrow(tenantId);
    if (!command.activo && !command.motivo?.trim()) {
      throw new BadRequestException('Indica el motivo de la suspensión');
    }
    if (tenant.activo === command.activo) return this.toTenantDto(tenant);

    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.update({ where: { id: tenantId }, data: { activo: command.activo } });
      await tx.auditoriaLog.create({
        data: {
          tenantId,
          accion: command.activo ? 'PLATFORM_TENANT_REACTIVADO' : 'PLATFORM_TENANT_SUSPENDIDO',
          usuarioId: actorId,
          servicio: 'servicio-identidad',
          recurso: 'Tenant',
          recursoId: tenantId,
          detalle: JSON.stringify({ motivo: command.motivo?.trim() || null }),
          resultado: 'OK',
          ip,
        },
      });
    });
    return this.obtenerTenant(tenantId);
  }

  async listarDomains(tenantId: string): Promise<{ domains: TenantDomainDto[] }> {
    await this.getTenantOrThrow(tenantId);
    const domains = await this.prisma.tenantDomain.findMany({
      where: { tenantId },
      orderBy: [{ principal: 'desc' }, { createdAt: 'asc' }],
    });
    return { domains: domains.map((domain) => this.toDomainDto(domain)) };
  }

  async crearDomain(
    tenantId: string,
    command: CrearTenantDomainCommand,
    actorId: string,
    ip?: string,
  ): Promise<TenantDomainDto> {
    await this.getTenantOrThrow(tenantId);
    const domain = this.normalizeDomain(command.domain);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const existingCount = await tx.tenantDomain.count({ where: { tenantId } });
        const principal = command.principal ?? existingCount === 0;
        if (principal) {
          await tx.tenantDomain.updateMany({ where: { tenantId }, data: { principal: false } });
        }
        const row = await tx.tenantDomain.create({
          data: { tenantId, domain, activo: true, principal },
        });
        await tx.auditoriaLog.create({
          data: {
            tenantId,
            accion: 'PLATFORM_TENANT_DOMAIN_CREADO',
            usuarioId: actorId,
            servicio: 'servicio-identidad',
            recurso: 'TenantDomain',
            recursoId: row.id,
            detalle: JSON.stringify({ domain, principal }),
            resultado: 'OK',
            ip,
          },
        });
        return row;
      });
      return this.toDomainDto(created);
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
        throw new ConflictException('El dominio ya está en uso');
      }
      throw error;
    }
  }

  async actualizarDomain(
    tenantId: string,
    domainId: string,
    command: ActualizarTenantDomainCommand,
    actorId: string,
    ip?: string,
  ): Promise<TenantDomainDto> {
    const current = await this.prisma.tenantDomain.findFirst({ where: { id: domainId, tenantId } });
    if (!current) throw new NotFoundException('Dominio no encontrado');
    const nextDomain = command.domain ? this.normalizeDomain(command.domain) : undefined;
    const mustMovePrimary = current.principal && command.activo === false;
    const removePrimary = current.principal && command.principal === false;

    const replacement = mustMovePrimary || removePrimary
      ? await this.prisma.tenantDomain.findFirst({
          where: { tenantId, id: { not: domainId }, activo: true },
          orderBy: { createdAt: 'asc' },
        })
      : null;
    if ((mustMovePrimary || removePrimary) && !replacement) {
      throw new ConflictException('El tenant debe conservar un dominio principal activo');
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        if (command.principal === true) {
          await tx.tenantDomain.updateMany({
            where: { tenantId, id: { not: domainId } },
            data: { principal: false },
          });
        } else if (replacement) {
          await tx.tenantDomain.update({
            where: { id: replacement.id },
            data: { principal: true, activo: true },
          });
        }
        const row = await tx.tenantDomain.update({
          where: { id: domainId },
          data: {
            domain: nextDomain,
            activo: command.principal === true ? true : command.activo,
            principal: replacement ? false : command.principal,
          },
        });
        await tx.auditoriaLog.create({
          data: {
            tenantId,
            accion: 'PLATFORM_TENANT_DOMAIN_ACTUALIZADO',
            usuarioId: actorId,
            servicio: 'servicio-identidad',
            recurso: 'TenantDomain',
            recursoId: domainId,
            detalle: JSON.stringify(command),
            resultado: 'OK',
            ip,
          },
        });
        return row;
      });
      return this.toDomainDto(updated);
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
        throw new ConflictException('El dominio ya está en uso');
      }
      throw error;
    }
  }

  async eliminarDomain(
    tenantId: string,
    domainId: string,
    actorId: string,
    ip?: string,
  ): Promise<{ success: true }> {
    const domains = await this.prisma.tenantDomain.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });
    const current = domains.find((domain) => domain.id === domainId);
    if (!current) throw new NotFoundException('Dominio no encontrado');
    if (domains.length <= 1) {
      throw new ConflictException('El tenant debe conservar al menos un dominio');
    }
    const replacement = current.principal
      ? domains.find((domain) => domain.id !== domainId && domain.activo)
      : undefined;
    if (current.principal && !replacement) {
      throw new ConflictException('Activa otro dominio antes de eliminar el principal');
    }

    await this.prisma.$transaction(async (tx) => {
      if (replacement) {
        await tx.tenantDomain.update({ where: { id: replacement.id }, data: { principal: true } });
      }
      await tx.tenantDomain.delete({ where: { id: domainId } });
      await tx.auditoriaLog.create({
        data: {
          tenantId,
          accion: 'PLATFORM_TENANT_DOMAIN_ELIMINADO',
          usuarioId: actorId,
          servicio: 'servicio-identidad',
          recurso: 'TenantDomain',
          recursoId: domainId,
          detalle: JSON.stringify({ domain: current.domain }),
          resultado: 'OK',
          ip,
        },
      });
    });
    return { success: true };
  }

  async listarAuditoria(
    tenantId: string,
    query: ListarAuditoriaPlataformaQuery = {},
  ): Promise<PlatformAuditListResponse> {
    await this.getTenantOrThrow(tenantId);
    const limit = this.normalizeLimit(query.limit);
    const logs = await this.prisma.auditoriaLog.findMany({
      where: { tenantId },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const hasMore = logs.length > limit;
    const page = logs.slice(0, limit);
    return {
      data: page.map((log) => ({
        id: log.id,
        tenantId: log.tenantId,
        accion: log.accion,
        usuarioId: log.usuarioId,
        servicio: log.servicio,
        recurso: log.recurso,
        recursoId: log.recursoId,
        detalle: log.detalle,
        resultado: log.resultado,
        ip: log.ip,
        createdAt: log.createdAt.toISOString(),
      })),
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
    };
  }
}
