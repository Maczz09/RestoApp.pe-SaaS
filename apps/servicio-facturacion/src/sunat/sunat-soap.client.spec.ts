import * as soap from 'soap';
import { SunatSoapClient } from './sunat-soap.client';
jest.mock('soap', () => ({ createClientAsync: jest.fn(), WSSecurity: jest.fn() }));
describe('SOAP credentials cache in SaaS', () => {
  const previous = process.env['SUNAT_WSDL_URL'];
  beforeEach(() => {
    jest.clearAllMocks(); process.env['SUNAT_WSDL_URL'] = 'https://sunat.example/billService';
    jest.mocked(soap.createClientAsync).mockImplementation(async () => ({ setEndpoint: jest.fn(), setSecurity: jest.fn() }) as never);
  });
  afterEach(() => { if (previous === undefined) delete process.env['SUNAT_WSDL_URL']; else process.env['SUNAT_WSDL_URL'] = previous; });
  it('does not reuse another restaurant SOL credentials even when the issuer RUC matches', async () => {
    const service = new SunatSoapClient();
    const first = await (service as any).obtenerCliente('20123456789', 'tenant-a-sol', 'secret-a');
    const second = await (service as any).obtenerCliente('20123456789', 'tenant-b-sol', 'secret-b');
    expect(first).not.toBe(second);
    expect(await (service as any).obtenerCliente('20123456789', 'tenant-a-sol', 'secret-a')).toBe(first);
    expect(soap.createClientAsync).toHaveBeenCalledTimes(2);
    service.invalidarRuc('20123456789');
    expect(await (service as any).obtenerCliente('20123456789', 'tenant-a-sol', 'secret-a')).not.toBe(first);
  });
});
