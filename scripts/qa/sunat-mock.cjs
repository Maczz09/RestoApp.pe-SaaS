// Only for the isolated local acceptance stack. Never use as a SUNAT endpoint
// in production. Returns an acceptance CDR and keeps an in-memory request count.
const http = require('node:http');
const { zipSync, strToU8 } = require('fflate');
const calls = [];
http.createServer((req, res) => {
  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ mock: true, count: calls.length, calls })); return;
  }
  let body = '';
  req.on('data', c => { body += c; if (body.length > 2_000_000) req.destroy(); });
  req.on('end', () => {
    const file = body.match(/<(?:\w+:)?fileName>([^<]+)<\/(?:\w+:)?fileName>/)?.[1] ?? 'comprobante.zip';
    calls.push({ file, at: new Date().toISOString() });
    const xml = '<ApplicationResponse xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"><cbc:ResponseCode>0</cbc:ResponseCode><cbc:Description>ACEPTADO EN SIMULADOR QA</cbc:Description></ApplicationResponse>';
    const cdr = Buffer.from(zipSync({ [`R-${file.replace(/\.zip$/, '.xml')}`]: strToU8(xml) })).toString('base64');
    res.setHeader('Content-Type', 'text/xml; charset=utf-8');
    res.end(`<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><ns:sendBillResponse xmlns:ns="http://service.sunat.gob.pe"><applicationResponse>${cdr}</applicationResponse></ns:sendBillResponse></soapenv:Body></soapenv:Envelope>`);
  });
}).listen(3000, '0.0.0.0');
