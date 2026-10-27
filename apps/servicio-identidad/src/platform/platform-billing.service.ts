import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface PlanInput {
  code?: string;
  nombre?: string;
  descripcion?: string | null;
  priceCents?: number;
  cycleDays?: number;
  activo?: boolean;
}

export interface PaymentInput {
  amountCents: number;
  periods: number;
  method: string;
  reference?: string;
  note?: string;
  paidAt?: string;
}

function codeOf(value: string): string {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9_]{3,32}$/.test(code)) throw new BadRequestException('Código de plan inválido');
  return code;
}

function dueState(due: Date | null): 'SIN_FECHA' | 'VENCIDO' | 'PROXIMO' | 'AL_DIA' {
  if (!due) return 'SIN_FECHA';
  const days = (due.getTime() - Date.now()) / 86_400_000;
  return days < 0 ? 'VENCIDO' : days <= 7 ? 'PROXIMO' : 'AL_DIA';
}

@Injectable()
export class PlatformBillingService {
  constructor(private readonly prisma: PrismaService) {}

  listPlans() {
    return this.prisma.platformPlan.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async createPlan(input: PlanInput, actorId: string) {
    if (!input.code || !input.nombre?.trim()) throw new BadRequestException('Código y nombre son obligatorios');
    const code = codeOf(input.code);
    this.validatePlan(input);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const plan = await tx.platformPlan.create({ data: {
          code, nombre: input.nombre!.trim(), descripcion: input.descripcion?.trim() || null,
          priceCents: input.priceCents ?? 0, cycleDays: input.cycleDays ?? 30,
          activo: input.activo ?? true,
        } });
        await tx.auditoriaLog.create({ data: { accion: 'PLATFORM_PLAN_CREADO', usuarioId: actorId, servicio: 'servicio-identidad', recurso: 'PlatformPlan', recursoId: code, detalle: JSON.stringify({ nombre: plan.nombre, priceCents: plan.priceCents }) } });
        return plan;
      });
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') throw new ConflictException('Ya existe un plan con ese código');
      throw error;
    }
  }

  async updatePlan(code: string, input: PlanInput, actorId: string) {
    code = codeOf(code);
    const existing = await this.prisma.platformPlan.findUnique({ where: { code } });
    if (!existing) throw new NotFoundException('Plan no encontrado');
    this.validatePlan(input);
    if (input.activo === false && await this.prisma.tenant.count({ where: { plan: code, activo: true } }) > 0) {
      throw new ConflictException('No se puede desactivar un plan asignado a restaurantes activos');
    }
    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.platformPlan.update({ where: { code }, data: {
        nombre: input.nombre?.trim(), descripcion: input.descripcion === null ? null : input.descripcion?.trim(),
        priceCents: input.priceCents, cycleDays: input.cycleDays, activo: input.activo,
      } });
      await tx.auditoriaLog.create({ data: { accion: 'PLATFORM_PLAN_ACTUALIZADO', usuarioId: actorId, servicio: 'servicio-identidad', recurso: 'PlatformPlan', recursoId: code, detalle: JSON.stringify(input) } });
      return plan;
    });
  }

  private validatePlan(input: PlanInput) {
    if (input.nombre !== undefined && !input.nombre.trim()) throw new BadRequestException('El nombre es obligatorio');
    if (input.priceCents !== undefined && (!Number.isInteger(input.priceCents) || input.priceCents < 0)) throw new BadRequestException('Precio inválido');
    if (input.cycleDays !== undefined && (!Number.isInteger(input.cycleDays) || input.cycleDays < 1 || input.cycleDays > 366)) throw new BadRequestException('Duración de ciclo inválida');
  }

  async listBilling() {
    const [tenants, plans, latest] = await Promise.all([
      this.prisma.tenant.findMany({ orderBy: { nombre: 'asc' }, select: { id: true, nombre: true, slug: true, plan: true, activo: true, nextDueAt: true, createdAt: true } }),
      this.prisma.platformPlan.findMany(),
      this.prisma.platformPayment.findMany({ distinct: ['tenantId'], orderBy: { paidAt: 'desc' }, select: { tenantId: true, paidAt: true, amountCents: true } }),
    ]);
    const byCode = new Map(plans.map((plan) => [plan.code, plan]));
    const byTenant = new Map(latest.map((payment) => [payment.tenantId, payment]));
    const data = tenants.map((tenant) => ({
      ...tenant, nextDueAt: tenant.nextDueAt?.toISOString() ?? null,
      createdAt: tenant.createdAt.toISOString(), estadoPago: dueState(tenant.nextDueAt),
      planNombre: byCode.get(tenant.plan)?.nombre ?? tenant.plan,
      priceCents: byCode.get(tenant.plan)?.priceCents ?? null,
      lastPaymentAt: byTenant.get(tenant.id)?.paidAt.toISOString() ?? null,
      lastPaymentCents: byTenant.get(tenant.id)?.amountCents ?? null,
      everPaid: byTenant.has(tenant.id),
    }));
    return { data, summary: {
      vencidos: data.filter((item) => item.estadoPago === 'VENCIDO').length,
      proximos: data.filter((item) => item.estadoPago === 'PROXIMO').length,
      alDia: data.filter((item) => item.estadoPago === 'AL_DIA').length,
      sinFecha: data.filter((item) => item.estadoPago === 'SIN_FECHA').length,
      sinPagos: data.filter((item) => !item.everPaid).length,
      conPagos: data.filter((item) => item.everPaid).length,
    } };
  }

  async listPayments(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) throw new NotFoundException('Restaurante no encontrado');
    return this.prisma.platformPayment.findMany({ where: { tenantId }, orderBy: { paidAt: 'desc' }, take: 100 });
  }

  async setDueDate(tenantId: string, nextDueAt: string, actorId: string) {
    const due = new Date(nextDueAt);
    if (!Number.isFinite(due.getTime())) throw new BadRequestException('Fecha de vencimiento inválida');
    return this.prisma.$transaction(async (tx) => {
      const previous = await tx.tenant.findUnique({ where: { id: tenantId } });
      if (!previous) throw new NotFoundException('Restaurante no encontrado');
      const changed = await tx.tenant.updateMany({ where: { id: tenantId, nextDueAt: previous.nextDueAt }, data: { nextDueAt: due } });
      if (changed.count !== 1) throw new ConflictException('El vencimiento cambió durante la edición; recarga e inténtalo de nuevo');
      await tx.auditoriaLog.create({ data: { tenantId, accion: 'PLATFORM_VENCIMIENTO_AJUSTADO', usuarioId: actorId, servicio: 'servicio-identidad', recurso: 'Tenant', recursoId: tenantId, detalle: JSON.stringify({ before: previous.nextDueAt?.toISOString(), after: due.toISOString() }) } });
      return { tenantId, nextDueAt: due.toISOString() };
    });
  }

  async recordPayment(tenantId: string, input: PaymentInput, actorId: string) {
    if (!Number.isInteger(input.amountCents) || input.amountCents < 0) throw new BadRequestException('Monto inválido');
    if (!Number.isInteger(input.periods) || input.periods < 1 || input.periods > 12) throw new BadRequestException('Períodos inválidos');
    if (!input.method?.trim()) throw new BadRequestException('Indica el medio de pago');
    const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
    if (!Number.isFinite(paidAt.getTime()) || paidAt.getTime() > Date.now() + 86_400_000) throw new BadRequestException('Fecha de pago inválida');
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) throw new NotFoundException('Restaurante no encontrado');
      const plan = await tx.platformPlan.findUnique({ where: { code: tenant.plan } });
      if (!plan) throw new BadRequestException('Configura un plan válido antes de registrar el pago');
      const before = tenant.nextDueAt ?? new Date();
      const after = new Date(before.getTime() + plan.cycleDays * input.periods * 86_400_000);
      const changed = await tx.tenant.updateMany({ where: { id: tenantId, nextDueAt: tenant.nextDueAt }, data: { nextDueAt: after } });
      if (changed.count !== 1) throw new ConflictException('Otro pago actualizó el vencimiento; recarga e inténtalo de nuevo');
      const payment = await tx.platformPayment.create({ data: {
        tenantId, planCode: plan.code, amountCents: input.amountCents, periods: input.periods,
        dueBefore: before, dueAfter: after, method: input.method.trim(),
        reference: input.reference?.trim() || null, note: input.note?.trim() || null,
        recordedBy: actorId, paidAt,
      } });
      await tx.auditoriaLog.create({ data: { tenantId, accion: 'PLATFORM_PAGO_REGISTRADO', usuarioId: actorId, servicio: 'servicio-identidad', recurso: 'PlatformPayment', recursoId: payment.id, detalle: JSON.stringify({ amountCents: input.amountCents, periods: input.periods, dueBefore: before.toISOString(), dueAfter: after.toISOString(), reference: input.reference }) } });
      return payment;
    });
  }
}
