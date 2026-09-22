import { describe, it, expect, vi } from 'vitest';
import { createBasePrismaService } from './base-prisma.service';

describe('BasePrismaService.withTenant', () => {
  it('throws an error if tenantId is missing or empty', async () => {
    class MockPrismaClient {}
    const ServiceClass = createBasePrismaService(MockPrismaClient);
    
    // Create an instance without calling full super constructor that requires DB
    const service = Object.create(ServiceClass.prototype);

    await expect(service.withTenant('', async () => 'ok')).rejects.toThrow(
      'Tenant ID is required for withTenant execution'
    );
    await expect(service.withTenant(null as any, async () => 'ok')).rejects.toThrow(
      'Tenant ID is required for withTenant execution'
    );
  });

  it('executes SET LOCAL app.tenant_id via set_config in a transaction', async () => {
    class MockPrismaClient {}
    const ServiceClass = createBasePrismaService(MockPrismaClient);
    const service = Object.create(ServiceClass.prototype);

    const mockExecuteRaw = vi.fn().mockResolvedValue(1);
    const mockTx = {
      $executeRaw: mockExecuteRaw,
      customQuery: vi.fn().mockResolvedValue({ id: '123' }),
    };

    service.$transaction = vi.fn().mockImplementation(async (callback: (tx: any) => Promise<any>) => {
      return callback(mockTx);
    });

    const result = await service.withTenant('tenant-abc', async (tx: any) => {
      return tx.customQuery();
    });

    expect(service.$transaction).toHaveBeenCalledTimes(1);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: '123' });
  });
});
