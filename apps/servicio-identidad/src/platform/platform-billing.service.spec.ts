import { BadRequestException, ConflictException } from '@nestjs/common';
import { PlatformBillingService } from './platform-billing.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PlatformBillingService', () => {
  const tx = {
    tenant: { findUnique: jest.fn(), updateMany: jest.fn() },
    platformPlan: { findUnique: jest.fn() },
    platformPayment: { create: jest.fn() },
    auditoriaLog: { create: jest.fn() },
  };
  const prisma = { $transaction: jest.fn((fn: (value: typeof tx) => unknown) => fn(tx)) } as unknown as PrismaService;
  const service = new PlatformBillingService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', plan: 'ESTANDAR', nextDueAt: new Date('2026-09-30T00:00:00Z') });
    tx.platformPlan.findUnique.mockResolvedValue({ code: 'ESTANDAR', cycleDays: 30 });
    tx.tenant.updateMany.mockResolvedValue({ count: 1 });
    tx.platformPayment.create.mockImplementation(async ({ data }) => ({ id: 'payment-1', ...data }));
  });

  it('avanza el vencimiento por los ciclos pagados y audita el cobro', async () => {
    const result = await service.recordPayment('tenant-1', { amountCents: 9900, periods: 2, method: 'YAPE', reference: 'OP-123' }, 'admin-1');
    expect(result.dueAfter.toISOString()).toBe('2026-11-29T00:00:00.000Z');
    expect(tx.tenant.updateMany).toHaveBeenCalledWith({ where: { id: 'tenant-1', nextDueAt: new Date('2026-09-30T00:00:00Z') }, data: { nextDueAt: new Date('2026-11-29T00:00:00Z') } });
    expect(tx.auditoriaLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tenantId: 'tenant-1', accion: 'PLATFORM_PAGO_REGISTRADO', usuarioId: 'admin-1' }) });
  });

  it('rechaza montos negativos y ciclos inválidos', async () => {
    await expect(service.recordPayment('tenant-1', { amountCents: -1, periods: 1, method: 'YAPE' }, 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.recordPayment('tenant-1', { amountCents: 100, periods: 0, method: 'YAPE' }, 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza una carrera de pagos sobre el mismo vencimiento', async () => {
    tx.tenant.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.recordPayment('tenant-1', { amountCents: 9900, periods: 1, method: 'YAPE' }, 'admin-1')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.platformPayment.create).not.toHaveBeenCalled();
  });
});
