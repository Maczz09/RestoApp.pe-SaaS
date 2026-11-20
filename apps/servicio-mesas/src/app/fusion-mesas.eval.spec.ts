import axios from 'axios';
import { FusionMesasService } from './fusion-mesas.service';
jest.mock('axios');
const payload = { fusionId: 'fusion', tenantId: 'tenant', sedeId: 'sede', maestraMesaId: 'm1', maestraCuentaId: 'c1', mesaIds: ['m1','m2'], cuentaIds: ['c1','c2'], pedidoIds: ['p1','p2'], huellas: { p1: 'a', p2: 'b' } };
describe('REST-102, contratos de la unión distribuida', () => {
  beforeEach(() => jest.resetAllMocks());
  it.each([
    ['caja', 'preparar', ['fusionId','tenantId','sedeId','maestraCuentaId','cuentaIds']],
    ['cuentas', 'confirmar', ['fusionId','tenantId','sedeId','maestraMesaId','maestraCuentaId','cuentaIds','pedidoIds','huellas']],
    ['pedidos', 'preparar', ['fusionId','tenantId','sedeId','maestraMesaId','maestraCuentaId','mesaIds','cuentaIds']],
  ])('envía solo el contrato aceptado por %s/%s', async (serviceName, route, keys) => {
    jest.mocked(axios.post).mockResolvedValue({ data: { estado: 'OK' } });
    const tokens = { generateServiceToken: jest.fn().mockReturnValue('token') };
    const service = new FusionMesasService({} as never, tokens as never, {} as never);
    await (service as any).remoto(serviceName, route, payload);
    expect(Object.keys(jest.mocked(axios.post).mock.calls[0][1] as object).sort()).toEqual([...(keys as string[])].sort());
    expect(tokens.generateServiceToken).toHaveBeenCalledWith('servicio-mesas', `servicio-${serviceName}`);
  });
  it('conserva la fase confirmada si un servicio cae y reintenta sin perder las cuentas', async () => {
    const state = { id: 'f', estado: 'CUENTAS', ...payload };
    const tx = { fusionMesas: { findUnique: jest.fn().mockImplementation(() => Promise.resolve({ ...state })), updateMany: jest.fn(({ data }) => { Object.assign(state, data); return Promise.resolve({ count: 1 }); }) } };
    jest.mocked(axios.post).mockRejectedValue(new Error('Conexión caída'));
    const service = new FusionMesasService(tx as never, { generateServiceToken: () => 'token' } as never, {} as never);
    await service.avanzar('f');
    expect(state.estado).toBe('CUENTAS');
    expect(state.cuentaIds).toEqual(['c1','c2']);
    expect(tx.fusionMesas.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { ultimoError: 'Conexión caída' } }));
    jest.mocked(axios.post).mockResolvedValue({ data: { estado: 'CONFIRMADA' } });
    // Stop at the next durable phase; the following local step needs a real DB.
    tx.fusionMesas.findUnique.mockResolvedValueOnce({ ...state }).mockResolvedValueOnce(null as never);
    await service.avanzar('f');
    expect(state.estado).toBe('PEDIDOS_CONFIRMADOS');
  });
});
