import { unzipSync, strFromU8 } from 'fflate';
import { DOMParser } from '@xmldom/xmldom';

/** SUNAT returns a ZIP (base64), not an acceptance flag. */
export function leerCdr(base64: string) {
  const archive = Buffer.from(base64, 'base64');
  if (!archive.length || archive.length > 2_000_000) throw new Error('CDR vacío o demasiado grande');
  const files = unzipSync(archive, { filter: entry => {
    if (entry.originalSize > 2_000_000) throw new Error('CDR descomprimido demasiado grande');
    return entry.name.toLowerCase().endsWith('.xml');
  } });
  const entries = Object.values(files);
  if (entries.length !== 1) throw new Error('El CDR debe contener un XML');
  const xml = strFromU8(entries[0]);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('CDR con declaraciones XML no permitidas');
  const doc = new DOMParser({ onError: level => { if (level !== 'warning') throw new Error('XML de CDR inválido'); } }).parseFromString(xml, 'text/xml');
  const text = (tag: string) => Array.from(doc.getElementsByTagNameNS('*', tag)).map(node => node.textContent?.trim() ?? '').filter(Boolean);
  const codes = text('ResponseCode');
  if (codes.length !== 1 || !/^\d+$/.test(codes[0])) throw new Error('CDR sin código de respuesta válido');
  const codigo = codes[0];
  const observaciones = text('Note');
  return { xml, codigo, descripcion: text('Description').join('; '), observaciones,
    estado: codigo === '0' ? observaciones.length ? 'OBSERVADO' as const : 'ACEPTADO' as const : 'RECHAZADO' as const };
}
