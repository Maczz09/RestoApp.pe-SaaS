import { CartaGateway } from './carta.gateway';
describe('SaaS public QR availability', () => {
  const sede = '00000000-0000-4000-8000-000000000001';
  it('joins only an isolated public branch room', () => {
    const gateway = new CartaGateway();
    const client = { handshake: { query: { sedeId: sede } }, join: jest.fn(), disconnect: jest.fn() };
    gateway.handleConnection(client as never);
    expect(client.join).toHaveBeenCalledWith(`carta-publica:sede:${sede}`);
    expect(client.disconnect).not.toHaveBeenCalled();
  });
  it.each([undefined, ['sedes'], 'all', 'rol:ADMIN'])('rejects invalid room selection (%s)', sedeId => {
    const client = { handshake: { query: { sedeId } }, join: jest.fn(), disconnect: jest.fn() };
    new CartaGateway().handleConnection(client as never);
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });
  it('broadcasts only product ID and availability to the requested branch', () => {
    const gateway = new CartaGateway(); const emit = jest.fn(), to = jest.fn().mockReturnValue({ emit });
    gateway.server = { to } as never;
    gateway.emitDisponibilidadCambiada(sede, 'producto', false);
    expect(to).toHaveBeenCalledWith(`carta-publica:sede:${sede}`);
    expect(emit).toHaveBeenCalledWith('disponibilidad:cambiada', { productoId: 'producto', disponible: false });
  });
});
