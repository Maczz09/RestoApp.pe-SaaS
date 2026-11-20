import { zipSync, strToU8 } from 'fflate';
import { leerCdr } from './cdr';

const cdr = (code: string, notes = '') => Buffer.from(zipSync({ 'R-comprobante.xml': strToU8(`<ApplicationResponse xmlns:cbc="urn:cbc"><cbc:ResponseCode>${code}</cbc:ResponseCode><cbc:Description>Respuesta SUNAT</cbc:Description>${notes}</ApplicationResponse>`) })).toString('base64');
describe('CDR SUNAT, escenarios de aceptación y rechazo', () => {
  it.each(['0', '2000', '4000'])('interpreta el código %s del XML y no la existencia del ZIP', code => {
    expect(leerCdr(cdr(code)).estado).toBe(code === '0' ? 'ACEPTADO' : 'RECHAZADO');
  });
  it('conserva observaciones de un documento aceptado', () => {
    expect(leerCdr(cdr('0', '<cbc:Note>Dato por revisar</cbc:Note>'))).toMatchObject({ estado: 'OBSERVADO', observaciones: ['Dato por revisar'] });
  });
  it.each(['', 'basura', Buffer.from(zipSync({ 'a.txt': strToU8('sin XML') })).toString('base64')])('no acepta respuestas ilegibles', value => {
    expect(() => leerCdr(value)).toThrow();
  });
  it('rechaza XML sin respuesta y entidades externas', () => {
    for (const xml of ['<ApplicationResponse/>', '<!DOCTYPE x [<!ENTITY a SYSTEM "file:///secret">]><x/>']) {
      expect(() => leerCdr(Buffer.from(zipSync({ 'r.xml': strToU8(xml) })).toString('base64'))).toThrow();
    }
  });
});
