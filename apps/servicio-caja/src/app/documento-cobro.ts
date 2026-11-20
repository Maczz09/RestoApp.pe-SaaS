import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma';
import { RoutingKeys, type PedidoSnapshotItem } from '@org/contracts';
import type { CuentaRemota } from './cuentas-http.client';

export type TipoDocumentoCobro = 'TICKET' | 'BOLETA' | 'FACTURA';
export interface DatosDocumentoCobro {
  tipoComprobante?: TipoDocumentoCobro;
  empresaRuc?: string;
  clienteDocumento?: string;
  clienteNombre?: string;
  clienteRazonSocial?: string;
}

export const centimos = (value: number | Prisma.Decimal) => new Prisma.Decimal(value).times(100).toNumber();

export function validarDocumentoCobro(datos: DatosDocumentoCobro, monto: Prisma.Decimal) {
  const tipo = datos.tipoComprobante;
  if (!tipo || tipo === 'TICKET') return;
  if (!/^\d{11}$/.test(datos.empresaRuc ?? '')) throw new BadRequestException('Selecciona el RUC emisor de la sede.');
  if (tipo === 'FACTURA') {
    if (!/^\d{11}$/.test(datos.clienteDocumento ?? '') || !datos.clienteRazonSocial?.trim()) {
      throw new BadRequestException('La factura requiere RUC de 11 dígitos y razón social.');
    }
  } else if (monto.greaterThan(700) || datos.clienteDocumento || datos.clienteNombre) {
    if (!/^\d{8}$/.test(datos.clienteDocumento ?? '') || !datos.clienteNombre?.trim()) {
      throw new BadRequestException('Para identificar al cliente de la boleta, indica su DNI de 8 dígitos y nombre.');
    }
  }
}

export function lineasDocumento(cuenta: CuentaRemota, monto: Prisma.Decimal): PedidoSnapshotItem[] {
  const items = (cuenta.pedidos ?? [])
    .filter(pedido => pedido.estado !== 'CANCELADO' && pedido.estado !== 'RECHAZADO_SIN_STOCK')
    .flatMap(pedido => pedido.items)
    .filter(item => item.estado !== 'CANCELADO' && item.estado !== 'RECHAZADO_SIN_STOCK');
  const pesos = items.map(item => new Prisma.Decimal(item.precioUnitario).times(item.cantidad));
  const bruto = pesos.reduce((sum, value) => sum.plus(value), new Prisma.Decimal(0));
  if (bruto.isZero()) throw new BadRequestException('No hay consumos para documentar este cobro.');
  const objetivo = centimos(monto);
  const cuotas = pesos.map(peso => peso.times(objetivo).div(bruto));
  const importes = cuotas.map(cuota => cuota.floor().toNumber());
  const diferencia = objetivo - importes.reduce((sum, value) => sum + value, 0);
  const orden = cuotas.map((cuota, index) => ({ index, resto: cuota.minus(importes[index]) }))
    .sort((a, b) => b.resto.comparedTo(a.resto));
  for (const { index } of orden.slice(0, diferencia)) importes[index] += 1;
  return items.flatMap((item, index) => {
    const cents = importes[index];
    const base = Math.floor(cents / item.cantidad);
    const resto = cents % item.cantidad;
    const lineas = [{ cantidad: item.cantidad - resto, precioUnitario: base / 100 }, { cantidad: resto, precioUnitario: (base + 1) / 100 }];
    return lineas.filter(linea => linea.cantidad > 0).map(linea => ({
      productoId: item.productoId, nombre: item.nombre, notas: item.notas, ...linea,
    }));
  });
}

export interface MedioCobro { metodo: string; monto: Prisma.Decimal; propina: Prisma.Decimal }
export type DocumentoCobroResultado = Awaited<ReturnType<typeof registrarDocumentoCobro>>;

export async function registrarDocumentoCobro(
  tx: Prisma.TransactionClient,
  scope: { tenantId: string; sedeId: string; cuentaId: string; mesaId: string },
  datos: DatosDocumentoCobro,
  items: PedidoSnapshotItem[],
  medios: MedioCobro[],
  transaccionIds: string[],
) {
  const tipo = datos.tipoComprobante;
  if (!tipo) return undefined;
  if (medios.length !== transaccionIds.length) throw new BadRequestException('Los medios no coinciden con las transacciones del documento');
  const total = medios.reduce((sum, medio) => sum.plus(medio.monto), new Prisma.Decimal(0));
  const detalle = medios.map((medio, index) => ({ transaccionId: transaccionIds[index], metodo: medio.metodo, monto: medio.monto.toNumber(), propina: medio.propina.toNumber() }));
  let correlativo: number | null = null;
  if (tipo === 'TICKET') {
    const counter = await tx.serieTicketInterno.upsert({
      where: { tenantId_sedeId: { tenantId: scope.tenantId, sedeId: scope.sedeId } },
      create: { tenantId: scope.tenantId, sedeId: scope.sedeId, correlativo: 1 },
      update: { correlativo: { increment: 1 } },
    });
    correlativo = counter.correlativo;
  }
  const documento = await tx.documentoCobro.create({ data: {
    ...scope, tipo, correlativo, total, items: structuredClone(items) as Prisma.InputJsonValue,
    medios: detalle, transaccionIds,
  } });
  if (tipo !== 'TICKET') {
    await tx.outboxEvent.create({ data: {
      tenantId: scope.tenantId,
      routingKey: RoutingKeys.EmisionCobroSolicitada,
      status: 'PENDING',
      payload: JSON.stringify({ ...scope, cobroId: documento.id, tipo, items, total: total.toNumber(),
        empresaRuc: datos.empresaRuc, clienteDocumento: datos.clienteDocumento, clienteNombre: datos.clienteNombre,
        clienteRazonSocial: datos.clienteRazonSocial }),
    } });
  }
  return {
    id: documento.id, tipo, estado: tipo === 'TICKET' ? 'INTERNO' : 'PENDIENTE_EMISION',
    serie: tipo === 'TICKET' ? 'TI01' : null, correlativo, medios: detalle,
    ticket: tipo === 'TICKET' ? {
      id: documento.id, cuentaId: scope.cuentaId, mesaId: scope.mesaId,
      items, subtotal: total.toNumber(), descuento: 0, total: total.toNumber(), fecha: documento.createdAt.toISOString(),
      serie: 'TI01', correlativo, medios: detalle,
    } : undefined,
  };
}
