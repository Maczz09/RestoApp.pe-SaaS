import { FusionPedidosService } from './fusion-pedidos.service';
describe('REST-102, pedidos después de unir mesas', () => {
  function setup(estado = 'CONFIRMADA') {
    const tx = { $executeRaw: jest.fn(), fusionPedidoMesa: { findUnique: jest.fn().mockResolvedValue({ estado, maestraMesaId: 'mesa1', maestraCuentaId: 'cuenta1' }) }, pedido: { updateMany: jest.fn() } };
    const prisma = { ...tx, pedido: { findUnique: jest.fn().mockResolvedValue({ mesaId: 'mesa2' }) }, $transaction: jest.fn(cb => cb(tx)) };
    return { tx, service: new FusionPedidosService(prisma as never) };
  }
  it('redirige las nuevas comandas a la mesa principal', async () => {
    const { service } = setup();
    expect(await service.normalizarMesa('mesa2')).toBe('mesa1');
  });
  it('un mensaje antiguo no restaura la cuenta secundaria ni su correlativo', async () => {
    const { service, tx } = setup();
    await service.asociarCuenta('pedido2', 'cuenta2', 'A0000002');
    expect(tx.pedido.updateMany).toHaveBeenCalledWith({ where: { id: 'pedido2' }, data: { cuentaId: 'cuenta1' } });
    expect(tx.$executeRaw).toHaveBeenCalled();
  });
  it('evita nuevas comandas y asociaciones mientras la unión está preparada', async () => {
    const { service, tx } = setup('PREPARADA');
    await expect(service.normalizarMesa('mesa2')).rejects.toThrow('uniéndose');
    await expect(service.asociarCuenta('pedido2', 'cuenta2')).rejects.toThrow('uniéndose');
    expect(tx.pedido.updateMany).not.toHaveBeenCalled();
  });
});
