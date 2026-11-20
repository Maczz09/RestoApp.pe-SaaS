import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { calcularDivision, centimosDivision, unidadesDivision, ConfigDivisionCuenta, DivisionCuentaDto, ItemFiscalDivision, PedidoDivisionSnapshot, UnidadDivision } from '@org/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma';
import { CuentasHttpClient } from './cuentas-http.client';
import { assertCuentaNoBloqueada } from './caja-fusion.service';

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
// PostgreSQL JSONB reorders object keys; compare business fields, not JSON layout.
const huellaUnidades = (units: UnidadDivision[]) => JSON.stringify(units.map(u =>
  [u.key,u.itemId,u.indiceUnidad,u.productoId,u.nombre,u.notas,u.centimos],
).sort((a,b) => String(a[0]).localeCompare(String(b[0]))));

export interface ValidacionParteDivision {
  cuentaId: string;
  tenantId?: string | null;
  planId?: string;
  parteId?: string;
  version?: number;
  montoCentimos: number;
  propinaCentimos: number;
  descuentoCentimos: number;
  totalCentimos?: number;
  pedidos?: PedidoDivisionSnapshot[];
}

/** Must run INSIDE the payment transaction after taking the account advisory lock. */
export async function validarParteDivision(tx: Prisma.TransactionClient, input: ValidacionParteDivision): Promise<{ parteId: string; items: ItemFiscalDivision[]; monto: number; tip: number } | null> {
  const plan = await tx.divisionCuenta.findUnique({ where: { cuentaId: input.cuentaId }, include: { partes: true } });
  if (!plan) {
    if (input.planId || input.parteId || input.version !== undefined) throw new ConflictException('La división de cuenta ya no existe; actualiza la pantalla');
    return null;
  }
  if (plan.tenantId !== input.tenantId) throw new NotFoundException('División no encontrada');
  if (!input.planId || !input.parteId || input.version === undefined) throw new ConflictException('Esta cuenta tiene una división guardada; selecciona una parte pendiente');
  if (plan.id !== input.planId || plan.version !== input.version) throw new ConflictException('La división cambió; actualiza la pantalla');
  if (input.totalCentimos !== undefined && plan.totalCentimos !== input.totalCentimos) throw new ConflictException('El total de la cuenta cambió después de dividir');
  if (input.pedidos && huellaUnidades(plan.unidades as unknown as UnidadDivision[]) !== huellaUnidades(unidadesDivision(input.pedidos))) throw new ConflictException('Los platos de la cuenta cambiaron después de dividir');
  const parte = plan.partes.find(p => p.id === input.parteId);
  if (!parte || parte.pagada) throw new ConflictException('La parte ya fue pagada o no pertenece a esta división');
  if (parte.montoCentimos !== input.montoCentimos || parte.propinaCentimos !== input.propinaCentimos || plan.descuentoCentimos !== input.descuentoCentimos) throw new BadRequestException('El pago no coincide con los importes de la parte guardada');
  return { parteId: parte.id, items: parte.items as unknown as ItemFiscalDivision[], monto: parte.montoCentimos / 100, tip: parte.propinaCentimos / 100 };
}

/** Link the new transaction(s), fiscal allocation and paid status in the same commit. */
export async function completarParteDivision(tx: Prisma.TransactionClient, parteId: string, transaccionIds: string[]): Promise<void> {
  if (!transaccionIds.length || new Set(transaccionIds).size !== transaccionIds.length) throw new BadRequestException('Faltan las transacciones de la parte');
  const parte = await tx.divisionParte.findUnique({ where: { id: parteId }, include: { division: true } });
  if (!parte || parte.pagada) throw new ConflictException('La parte ya fue pagada');
  const transactions = await tx.transaccion.findMany({ where: { id: { in: transaccionIds }, cuentaId: parte.division.cuentaId, tenantId: parte.division.tenantId, divisionParteId: null } });
  if (transactions.length !== transaccionIds.length || transactions.reduce((n, t) => n + Math.round(t.monto.toNumber() * 100), 0) !== parte.montoCentimos) throw new ConflictException('Las transacciones no corresponden a esta parte');
  await tx.transaccion.updateMany({ where: { id: { in: transaccionIds } }, data: { divisionParteId: parteId } });
  const result = await tx.divisionParte.updateMany({ where: { id: parteId, pagada: false }, data: { pagada: true, pagadaAt: new Date(), transaccionIds } });
  if (result.count !== 1) throw new ConflictException('La parte ya fue pagada');
}

@Injectable()
export class DivisionCuentaService {
  constructor(private readonly prisma: PrismaService, private readonly cuentas: CuentasHttpClient) {}

  private async cuentaAccesible(cuentaId: string, tenantId?: string | null, sedeId?: string | null) {
    if (!tenantId) throw new BadRequestException('Selecciona un restaurante');
    const cuenta = await this.cuentas.fetchCuenta(cuentaId);
    if (cuenta.tenantId !== tenantId || (sedeId && cuenta.sedeId !== sedeId)) throw new NotFoundException('Cuenta no encontrada');
    return cuenta;
  }

  async obtener(cuentaId: string, tenantId?: string | null, sedeId?: string | null): Promise<DivisionCuentaDto | null> {
    await this.cuentaAccesible(cuentaId, tenantId, sedeId);
    const plan = await this.prisma.divisionCuenta.findUnique({ where: { cuentaId }, include: { partes: { orderBy: { indice: 'asc' } } } });
    return plan && plan.tenantId === tenantId ? this.dto(plan) : null;
  }

  async guardar(cuentaId: string, config: ConfigDivisionCuenta, tenantId?: string | null, sedeId?: string | null): Promise<DivisionCuentaDto> {
    const cuenta = await this.cuentaAccesible(cuentaId, tenantId, sedeId);
    if (cuenta.estado !== 'ABIERTA') throw new ConflictException('La cuenta ya no está abierta');
    let partes: ReturnType<typeof calcularDivision>;
    try { partes = calcularDivision(cuenta.total, cuenta.pedidos ?? [], config); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'División inválida'); }
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1234, ('x' || substr(md5(${cuentaId}), 1, 8))::bit(32)::int)`;
      await assertCuentaNoBloqueada(tx, cuentaId);
      const existing = await tx.divisionCuenta.findUnique({ where: { cuentaId }, include: { partes: true } });
      if (existing && existing.tenantId !== tenantId) throw new NotFoundException('División no encontrada');
      const pagos = await tx.transaccion.count({ where: { cuentaId, tenantId } });
      const pendientes = await tx.pagoPendiente.count({ where: { cuentaId, tenantId, estado: { in: ['PENDIENTE', 'PROCESANDO'] } } });
      if (pagos || pendientes || existing?.partes.some(p => p.pagada)) throw new ConflictException('La división queda bloqueada después de registrar o poner en cola un pago');
      if (existing && config.version !== existing.version) throw new ConflictException('La división cambió; actualiza la pantalla');
      const data = { tenantId: tenantId as string, sedeId: cuenta.sedeId, modo: config.modo, config: json(config), unidades: json(unidadesDivision(cuenta.pedidos ?? [])), totalCentimos: centimosDivision(cuenta.total), descuentoCentimos: centimosDivision(config.descuento), propinaCentimos: centimosDivision(config.propina) };
      const nested = partes.map(p => ({ indice: p.indice, label: p.label, montoCentimos: centimosDivision(p.monto), propinaCentimos: centimosDivision(p.tip), unidades: json(p.unidades), items: json(p.items) }));
      const plan = existing
        ? await tx.divisionCuenta.update({ where: { id: existing.id }, data: { ...data, version: { increment: 1 }, partes: { deleteMany: {}, create: nested } }, include: { partes: { orderBy: { indice: 'asc' } } } })
        : await tx.divisionCuenta.create({ data: { ...data, cuentaId, partes: { create: nested } }, include: { partes: { orderBy: { indice: 'asc' } } } });
      return this.dto(plan);
    });
  }

  async eliminar(cuentaId: string, tenantId?: string | null, sedeId?: string | null) {
    await this.cuentaAccesible(cuentaId, tenantId, sedeId);
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1234, ('x' || substr(md5(${cuentaId}), 1, 8))::bit(32)::int)`;
      await assertCuentaNoBloqueada(tx, cuentaId);
      const plan = await tx.divisionCuenta.findUnique({ where: { cuentaId }, include: { partes: true } });
      if (!plan) return { eliminada: true };
      if (plan.tenantId !== tenantId) throw new NotFoundException('División no encontrada');
      const pagos = await tx.transaccion.count({ where: { cuentaId, tenantId } });
      const pendientes = await tx.pagoPendiente.count({ where: { cuentaId, tenantId, estado: { in: ['PENDIENTE', 'PROCESANDO'] } } });
      if (pagos || pendientes || plan.partes.some(p => p.pagada)) throw new ConflictException('No puedes quitar una división que ya tiene cobros');
      await tx.divisionCuenta.delete({ where: { id: plan.id } });
      return { eliminada: true };
    });
  }

  /** Append new consumptions without reallocating or rewriting paid portions. */
  async ampliar(cuentaId: string, version: number, tenantId?: string | null, sedeId?: string | null): Promise<DivisionCuentaDto> {
    const cuenta = await this.cuentaAccesible(cuentaId, tenantId, sedeId);
    if (cuenta.estado !== 'ABIERTA') throw new ConflictException('La cuenta ya no está abierta');
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1234, ('x' || substr(md5(${cuentaId}), 1, 8))::bit(32)::int)`;
      await assertCuentaNoBloqueada(tx, cuentaId);
      const plan = await tx.divisionCuenta.findUnique({ where: { cuentaId }, include: { partes: true } });
      if (!plan || plan.tenantId !== tenantId) throw new NotFoundException('División no encontrada');
      if (plan.version !== version) throw new ConflictException('La división cambió; actualiza la pantalla');
      const current = unidadesDivision(cuenta.pedidos ?? []), byKey = new Map(current.map(u => [u.key,u]));
      const original = plan.unidades as unknown as UnidadDivision[];
      if (original.some(u => !byKey.has(u.key) || huellaUnidades([u]) !== huellaUnidades([byKey.get(u.key)!]))) throw new ConflictException('Los consumos originales cambiaron. No se pueden alterar las partes ya documentadas');
      const oldKeys = new Set(original.map(u => u.key)), added = current.filter(u => !oldKeys.has(u.key));
      if (!added.length) return this.dto(plan);
      const amount = added.reduce((s,u) => s+u.centimos,0), total = centimosDivision(cuenta.total);
      if (amount <= 0 || total !== plan.totalCentimos + amount) throw new ConflictException('El detalle no coincide con el total actual');
      if (plan.partes.length >= 50) throw new ConflictException('Esta división ya tiene el máximo de partes');
      const indice = Math.max(...plan.partes.map(p => p.indice)) + 1;
      const config = plan.config as unknown as ConfigDivisionCuenta;
      const updated = await tx.divisionCuenta.update({ where: { id: plan.id }, data: {
        totalCentimos: total, unidades: json(current), version: { increment: 1 },
        config: json({ ...config, ...(config.modo === 'ITEMS' ? { numPartes: Math.max(config.numPartes, indice+1), asignaciones: { ...config.asignaciones, ...Object.fromEntries(added.map(u=>[u.key,indice+1])) } } : {}) }),
        partes: { create: { indice, label: 'Consumos adicionales', montoCentimos: amount, propinaCentimos: 0, unidades: json(added), items: json(added.map(u=>({ productoId:u.productoId,nombre:u.nombre,notas:u.notas,cantidad:1,precioUnitario:u.centimos/100 }))) } },
      }, include: { partes: { orderBy: { indice: 'asc' } } } });
      return this.dto(updated);
    });
  }

  private dto(plan: Prisma.DivisionCuentaGetPayload<{ include: { partes: true } }>): DivisionCuentaDto {
    const config = plan.config as unknown as ConfigDivisionCuenta;
    return { id: plan.id, cuentaId: plan.cuentaId, version: plan.version, modo: config.modo, numPartes: config.numPartes, asignaciones: config.asignaciones ?? {}, descuento: plan.descuentoCentimos / 100, propina: plan.propinaCentimos / 100, total: plan.totalCentimos / 100,
      partes: plan.partes.map(p => ({ id: p.id, indice: p.indice, label: p.label, monto: p.montoCentimos / 100, tip: p.propinaCentimos / 100, unidades: p.unidades as unknown as DivisionCuentaDto['partes'][number]['unidades'], items: p.items as unknown as ItemFiscalDivision[], pagada: p.pagada, transaccionIds: p.transaccionIds as unknown as string[] })) };
  }
}
