/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// screens/caja/CobroMesaDrawer.tsx — Cobro de una cuenta de mesa (REAL).
// Cableado a useCuentasQuery: registrarPago / registrarPagoCombinado. El backend
// registra el pago y cierra la cuenta.
// T-16: soporta pago único, división en partes iguales y división por plato
// (cada comensal paga lo que consumió). Cada parte puede usar un método único
// o varios métodos; un pago combinado se persiste atómicamente en el backend.

import { Scrim } from '../../components/ui/Scrim';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icons, type IconName } from '../../components/ui/icons';
import { fmt } from '../../utils/format';
import { useDivisionCuenta } from '../../hooks/queries/useDivisionCuenta';
import { calcularDivision, unidadesDivision } from '../../domain/divisionCuenta';
import { useCuentasQuery } from '../../hooks/queries/useCuentasQuery';
import { useSedeActualQuery } from '../../hooks/queries/useSedesQuery';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useToast } from '../../components/ui/ToastProvider';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { BoletaInterna } from './BoletaInterna';
import { DocumentoCobroSelector, DOCUMENTO_VACIO, documentoCompleto } from './DocumentoCobroSelector';
import type { MetodoPago, CuentaVM, TicketDto, TransaccionDto } from '../../types/cuenta.types';
import type { PedidoItemVM } from '../../types/pedido.types';

const METODOS: { value: MetodoPago; label: string; ic: IconName; color: string }[] = [
  { value: 'EFECTIVO', label: 'Efectivo', ic: 'Cash', color: 'var(--ok)' },
  { value: 'TARJETA', label: 'Tarjeta', ic: 'Card', color: 'var(--info)' },
  { value: 'YAPE', label: 'Yape', ic: 'Wallet', color: '#6c2bd9' },
  { value: 'PLIN', label: 'Plin', ic: 'Wallet', color: '#0aa3c2' },
  { value: 'TRANSFERENCIA', label: 'Transferencia', ic: 'Coins', color: 'var(--text-2)' },
];

type ModoDivision = 'UNICO' | 'PARTES' | 'ITEMS';
type ModoPago = 'UNICO' | 'COMBINADO';
type DistribucionPago = Record<MetodoPago, string>;

const DISTRIBUCION_VACIA: DistribucionPago = {
  EFECTIVO: '', TARJETA: '', YAPE: '', PLIN: '', TRANSFERENCIA: '',
};

export interface TramoPago {
  metodo: MetodoPago;
  monto: number;
  propina: number;
  total: number;
}

/**
 * Convierte lo digitado por el cajero (importe total por medio, incluida la
 * propina) en pagos parciales compatibles con caja. Trabaja en céntimos para
 * que la suma que llega a operaciones sea exactamente la mostrada en UI.
 */
export function construirTramosPago(
  distribucion: DistribucionPago,
  montoBase: number,
  propina: number,
): TramoPago[] {
  const baseCents = Math.round(montoBase * 100);
  const tipCents = Math.round(propina * 100);
  const totalCents = baseCents + tipCents;
  const entradas = METODOS
    .map(({ value }) => ({ metodo: value, cents: Math.round((Number(distribucion[value]) || 0) * 100) }))
    .filter(({ cents }) => cents > 0);
  if (baseCents <= 0 || entradas.length < 2 || entradas.reduce((suma, entrada) => suma + entrada.cents, 0) !== totalCents) return [];

  // Método de restos mayores: distribuye la propina proporcionalmente y
  // conserva exactamente todos los céntimos, sin producir propinas negativas.
  const cuotas = entradas.map((entrada, index) => {
    const exacta = entrada.cents * tipCents / totalCents;
    const piso = Math.floor(exacta);
    return { index, piso, resto: exacta - piso };
  });
  let faltantes = tipCents - cuotas.reduce((suma, cuota) => suma + cuota.piso, 0);
  [...cuotas].sort((a, b) => b.resto - a.resto).forEach((cuota) => {
    if (faltantes > 0 && cuota.piso < entradas[cuota.index].cents) {
      cuota.piso += 1;
      faltantes -= 1;
    }
  });

  const tramos = entradas.map((entrada, index) => {
    const tip = cuotas[index].piso;
    const base = entrada.cents - tip;
    return { metodo: entrada.metodo, monto: base / 100, propina: tip / 100, total: entrada.cents / 100 };
  });
  // Cada tramo debe aplicar por lo menos un céntimo al saldo de la cuenta. Si
  // la propina absorbiera por completo uno de los métodos, el backend ya no
  // recibiría un pago realmente combinado.
  return tramos.length >= 2 && tramos.every((tramo) => tramo.monto > 0) ? tramos : [];
}

interface Parte {
  label: string;
  monto: number;
  tip: number;
  comensal?: number;
}

interface Props {
  mesaId: string;
  mesaNumero?: string;
  mesaUnidaCon?: string;
  onClose: () => void;
  onPaid?: () => void;
}

export function CobroMesaDrawer({ mesaId, mesaNumero, mesaUnidaCon, onClose, onPaid }: Readonly<Props>) {
  const online = useOnlineStatus();
  const { toast } = useToast();
  const { sede } = useSedeActualQuery();
  const {
    cuentaActiva, loading, error, success, queryError,
    registrarPago, registrarPagoCombinado, clearFeedback, refetchCuenta,
  } = useCuentasQuery(mesaId);
  const divisionQuery = useDivisionCuenta(cuentaActiva?.id);
  const { division } = divisionQuery;
  const modalRef = useRef<HTMLDialogElement>(null);
  useFocusTrap(modalRef, { active: true, onClose });

  const [metodo, setMetodo] = useState<MetodoPago>('EFECTIVO');
  const [modoPago, setModoPago] = useState<ModoPago>('UNICO');
  const [distribucionPago, setDistribucionPago] = useState<DistribucionPago>({ ...DISTRIBUCION_VACIA });
  const [recibido, setRecibido] = useState('');
  const [descuento, setDescuento] = useState('0');
  const [propina, setPropina] = useState('0');
  const [documento, setDocumento] = useState(DOCUMENTO_VACIO);
  const [procesando, setProcesando] = useState(false);
  const cobroEnCurso = useRef(false);
  const [recibo, setRecibo] = useState<{ ticket: TicketDto; transaccion: TransaccionDto; cuentaCompleta: boolean; propina: number } | null>(null);

  const [modoDivision, setModoDivision] = useState<ModoDivision>('UNICO');
  const [numPartes, setNumPartes] = useState(2);
  const [numComensales, setNumComensales] = useState(2);
  const [comensalPorItem, setComensalPorItem] = useState<Record<string, number>>({});
  const [parteIndex, setParteIndex] = useState(0);
  const [partesPagadas, setPartesPagadas] = useState<Parte[]>([]);

  const subtotal = cuentaActiva?.total ?? 0;
  const desc = Number(descuento) || 0;
  const tip = Number(propina) || 0;
  const totalBase = Math.max(0, subtotal - desc);
  const totalCobro = totalBase + tip;
  const igv = totalBase - totalBase / 1.18;

  // Solo ítems efectivamente cobrables: excluye pedidos enteros no cobrables
  // (CANCELADO/RECHAZADO_SIN_STOCK) y, dentro de pedidos vigentes, los ítems
  // anulados puntualmente (CU-01/CU-02) — no deben aparecer en el cobro ni en la boleta.
  const items = useMemo(
    () =>
      (cuentaActiva?.pedidos ?? [])
        .filter((p) => p.estado !== 'CANCELADO' && p.estado !== 'RECHAZADO_SIN_STOCK')
        .flatMap((p) => p.items)
        .filter((it) => it.estado !== 'CANCELADO'),
    [cuentaActiva],
  );

  // Configuración de división bloqueada una vez que la primera parte ya se cobró:
  // cambiar el modo/las asignaciones a mitad de camino descuadraría lo ya pagado.
  const divisionBloqueada = parteIndex > 0 || Boolean(division?.partes.some(parte => parte.pagada));

  useEffect(() => {
    setModoDivision('UNICO');
    setParteIndex(0);
    setPartesPagadas([]);
    setComensalPorItem({});
    setNumPartes(2);
    setNumComensales(2);
    setDocumento(DOCUMENTO_VACIO);
    setModoPago('UNICO');
    setDistribucionPago({ ...DISTRIBUCION_VACIA });
  }, [cuentaActiva?.id]);

  useEffect(() => {
    if (!division || division.cuentaId !== cuentaActiva?.id) return;
    setModoDivision(division.modo);
    setNumPartes(division.numPartes);
    setNumComensales(division.numPartes);
    setComensalPorItem(division.asignaciones);
    setDescuento(String(division.descuento));
    setPropina(String(division.propina));
    const pagadas = division.partes.filter(parte => parte.pagada);
    setPartesPagadas(pagadas);
    setParteIndex(Math.max(0, division.partes.findIndex(parte => !parte.pagada)));
  }, [division, cuentaActiva?.id]);

  const configDivision = useMemo(() => {
    if (modoDivision === 'UNICO') return null;
    const asignaciones = modoDivision === 'ITEMS' ? Object.fromEntries(
      unidadesDivision(cuentaActiva?.pedidos ?? []).map(unidad => [unidad.key, comensalPorItem[unidad.key] ?? 1]),
    ) : {};
    return { modo: modoDivision, numPartes: modoDivision === 'PARTES' ? numPartes : numComensales,
      asignaciones, descuento: desc, propina: tip, version: division?.version };
  }, [modoDivision, cuentaActiva, comensalPorItem, numPartes, numComensales, desc, tip, division?.version]);
  const partes = useMemo<Parte[]>(() => {
    if (!configDivision) return [{ label: 'Total', monto: totalBase, tip }];
    if (division?.partes.some(parte => parte.pagada)) return division.partes;
    try { return calcularDivision(subtotal, cuentaActiva?.pedidos ?? [], configDivision); }
    catch { return []; }
  }, [configDivision, totalBase, tip, subtotal, cuentaActiva, division]);
  const itemsVisuales = useMemo(() => modoDivision === 'ITEMS' ? items.flatMap(item =>
    Array.from({ length: item.cantidad }, (_, indice) => ({
      ...item, id: `${item.id}:${indice}`, cantidad: 1, subtotal: item.precioUnitario,
      nombre: item.cantidad > 1 ? `${item.nombre} · unidad ${indice + 1}` : item.nombre,
    }))) : items, [items, modoDivision]);

  const parteActual = partes[Math.min(parteIndex, partes.length - 1)] ?? { label: 'Total', monto: totalBase, tip };
  const esUltimaParte = modoDivision === 'UNICO' || (division ? division.partes.filter(p => !p.pagada).length === 1 : parteIndex >= partes.length - 1);
  const montoAPagar = modoDivision === 'UNICO' ? totalBase : parteActual.monto;
  const tipAPagar = modoDivision === 'UNICO' ? tip : parteActual.tip;
  const totalConTip = montoAPagar + tipAPagar;
  const pendienteRestante = useMemo(
    () => partes.slice(parteIndex).reduce((acc, p) => acc + p.monto + p.tip, 0),
    [partes, parteIndex],
  );

  const totalDistribuido = useMemo(
    () => Object.values(distribucionPago).reduce((suma, valor) => suma + (Number(valor) || 0), 0),
    [distribucionPago],
  );
  const cantidadMetodosDistribuidos = Object.values(distribucionPago)
    .filter((valor) => Math.round((Number(valor) || 0) * 100) > 0).length;
  const efectivoDistribuido = Number(distribucionPago.EFECTIVO) || 0;
  const diferenciaDistribucion = Math.round((totalConTip - totalDistribuido) * 100) / 100;
  const recNum = Number(recibido || 0);
  const efectivoEsperado = modoPago === 'COMBINADO' ? efectivoDistribuido : totalConTip;
  const usaEfectivo = modoPago === 'COMBINADO' ? efectivoDistribuido > 0 : metodo === 'EFECTIVO';
  const vuelto = usaEfectivo ? Math.max(0, recNum - efectivoEsperado) : 0;
  const faltaPago = (modoPago === 'COMBINADO'
    && (cantidadMetodosDistribuidos < 2 || Math.abs(diferenciaDistribucion) >= 0.01))
    || (usaEfectivo && recNum < efectivoEsperado);

  useEffect(() => {
    if (!cuentaActiva) return;
    const sugerido = totalConTip > 0 ? totalConTip.toFixed(2) : '';
    setRecibido(sugerido);
    if (modoPago === 'COMBINADO') {
      setDistribucionPago({ ...DISTRIBUCION_VACIA, EFECTIVO: sugerido });
    }
    // Solo se re-propone el monto sugerido al cambiar de cuenta, de modo o de
    // parte o al recalcular descuento/propina — no en cada tecla de recibido.
  }, [cuentaActiva?.id, parteIndex, modoDivision, numPartes, totalConTip, modoPago]);

  const cambiarModoPago = (nuevo: ModoPago) => {
    setModoPago(nuevo);
    if (nuevo === 'COMBINADO') {
      setDistribucionPago({ ...DISTRIBUCION_VACIA, EFECTIVO: totalConTip.toFixed(2) });
      setRecibido(totalConTip.toFixed(2));
    }
  };

  const appendDigit = (r: string, d: string): string => {
    if (d === 'C') return '';
    if (d === '.') return r.includes('.') ? r : (r || '0') + '.';
    return r + d;
  };
  const key = (d: string) => setRecibido((r) => appendDigit(r, d));

  const handlePagar = async () => {
    if (!cuentaActiva || !online || divisionQuery.loading || partes.length === 0 || faltaPago || cobroEnCurso.current || !documento.tipoComprobante || !documentoCompleto(documento, montoAPagar)) return;
    cobroEnCurso.current = true;
    setProcesando(true);
    const datosDocumento = {
      documentoV2: true, tipoComprobante: documento.tipoComprobante,
      ...(documento.tipoComprobante === 'TICKET' ? {} : {
        empresaRuc: documento.empresaRuc, clienteDocumento: documento.clienteDocumento.trim() || undefined,
        clienteNombre: documento.clienteNombre.trim() || undefined,
        clienteRazonSocial: documento.clienteRazonSocial.trim() || undefined,
      }),
    };
    try {
      const tramos = modoPago === 'COMBINADO'
        ? construirTramosPago(distribucionPago, montoAPagar, tipAPagar)
        : [{ metodo, monto: montoAPagar, propina: tipAPagar, total: totalConTip }];
      if (tramos.length === 0) {
        toast({ title: 'Distribución incompleta', msg: 'La suma de los métodos debe coincidir exactamente con el total.', icon: 'Alert', kind: 'err' });
        return;
      }

      let datosDivision = {};
      if (!configDivision && division) await divisionQuery.eliminar();
      if (configDivision) {
        const plan = division?.partes.some(parte => parte.pagada) ? division : await divisionQuery.guardar(configDivision);
        const seleccion = plan.partes.find(parte => !parte.pagada);
        if (!seleccion) throw new Error('Todas las partes ya se cobraron. Actualiza la cuenta.');
        if (seleccion.monto !== montoAPagar || seleccion.tip !== tipAPagar) throw new Error('Los importes de la división cambiaron; revisa la cuenta.');
        datosDivision = { divisionPlanId: plan.id, divisionParteId: seleccion.id, divisionVersion: plan.version };
      }
      const respuesta = modoPago === 'COMBINADO'
        ? await registrarPagoCombinado({
          cuentaId: cuentaActiva.id,
          pagos: tramos.map((tramo) => ({ metodo: tramo.metodo, monto: tramo.monto, propina: tramo.propina })),
          descuento: desc,
          mesaNumero,
          mesaUnidaCon,
          ...datosDocumento,
          ...datosDivision,
          notas: `Pago combinado · ${tramos.map((tramo) => tramo.metodo).join(' + ')}`,
        })
        : await registrarPago({
          cuentaId: cuentaActiva.id,
          montoRecibido: montoAPagar,
          metodo,
          descuento: desc,
          propina: tipAPagar,
          mesaNumero,
          mesaUnidaCon,
          ...datosDocumento,
          ...datosDivision,
        });
      if (respuesta?.queued) {
        // No hay turno de caja abierto: el cobro ya quedó guardado tal cual
        // se llenó y se registrará solo en cuanto se abra un turno — no hay
        // ticket que imprimir todavía, así que solo se avisa y se cierra.
        toast({
          title: 'Caja cerrada: pago en espera',
          msg: 'Se registrará automáticamente en cuanto se abra un turno de caja.',
          icon: 'Clock',
          kind: 'warn',
        });
        onClose();
        return;
      }
      if (configDivision) await divisionQuery.invalidar();
      const cuentaCompleta = Number(respuesta?.pendiente ?? 0) === 0;
      if (respuesta?.documento?.estado === 'PENDIENTE_EMISION') {
        toast({ title: 'Cobro registrado', msg: 'Consulta la emisión electrónica en Facturación.', icon: 'Check', kind: 'ok' });
      }
      if (cuentaCompleta) {
        onPaid?.();
        if (respuesta?.ticket && respuesta.transaccion) {
          const metodosUsados = tramos.map((tramo) => METODOS.find((m) => m.value === tramo.metodo)?.label ?? tramo.metodo).join(' + ');
          setRecibo({
            cuentaCompleta: true, propina: tipAPagar,
            ticket: respuesta.ticket,
            transaccion: modoPago === 'COMBINADO'
              ? { ...respuesta.transaccion, metodo: metodosUsados, monto: montoAPagar }
              : respuesta.transaccion,
          });
        } else {
          onClose();
        }
      } else {
        setPartesPagadas((prev) => [...prev, { ...parteActual, comensal: parteActual.comensal }]);
        toast({
          title: esUltimaParte ? 'Pago parcial registrado' : `${parteActual.label} cobrada`,
          msg: `Pendiente por cobrar: ${fmt(respuesta?.pendiente ?? (pendienteRestante - totalConTip))}`,
          icon: 'Check',
          kind: 'ok',
        });

        setRecibido('');
        setDocumento(DOCUMENTO_VACIO);
        if (respuesta?.ticket && respuesta.transaccion) {
          setRecibo({ ticket: respuesta.ticket, transaccion: respuesta.transaccion, cuentaCompleta: false, propina: tipAPagar });
        }
      }
    } catch (err) {
      toast({ title: 'No se pudo registrar el pago', msg: err instanceof Error ? err.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' });
    } finally {
      cobroEnCurso.current = false;
      setProcesando(false);
    }
  };

  return (
    <div className="modal-wrap">
      <Scrim onClose={onClose} />
      <dialog
        open
        className="modal xwide"
        ref={modalRef}
        aria-modal="true"
        aria-label="Cobrar cuenta"
        style={{ position: 'relative', zIndex: 1 }}
      >
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <h3 style={{ fontSize: 18 }}>Cobrar cuenta</h3>
          <span className="tag-canal salon" style={{ marginLeft: 4 }}>Mesa {mesaNumero ?? cuentaActiva?.mesaId ?? ''}</span>
          {cuentaActiva && <span className="muted" style={{ fontSize: 13 }}>· {items.length} ítems</span>}
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar cobro de cuenta"><Icons.Close s={17} /></button>
        </div>

        {(error || success) && (
          <div className={`banner ${error ? 'err' : 'ok'}`} style={{ margin: '12px 20px 0' }} role="alert" aria-live={error ? 'assertive' : 'polite'}>
            {error ? <Icons.Alert s={16} /> : <Icons.Check s={16} />}
            <span>{error ?? success}</span>
            <span className="spacer" />
            {/* T-04: "Reintentar" solo aplica cuando falló la carga de la cuenta
                (GET) — si lo que falló fue pagar/abrir/cerrar, un refetch de la
                cuenta no reintenta esa acción, solo confunde. */}
            {error && queryError && (
              <button className="btn btn-sm btn-ghost" onClick={() => void refetchCuenta()} aria-label="Reintentar carga de la cuenta">Reintentar</button>
            )}
            <button className="btn btn-sm btn-ghost" onClick={clearFeedback} aria-label="Cerrar notificación">Cerrar</button>
          </div>
        )}

        {divisionQuery.error && <div className="banner err" role="alert" style={{ margin: '12px 20px' }}>
          <span>No se pudo cargar la división: {divisionQuery.error}</span>
          <button className="btn btn-sm" onClick={() => void divisionQuery.refetch()}>Reintentar división</button>
        </div>}
        {division && cuentaActiva && cuentaActiva.total > division.total && <div className="banner warn" role="status" style={{ margin: '12px 20px' }}>
          <span>Hay nuevos consumos. Se cobrarán en una parte adicional conservando los pagos anteriores.</span>
          <button className="btn btn-sm" disabled={!online || procesando || divisionQuery.saving} onClick={() => void divisionQuery.ampliar(division.version).catch(() => undefined)}>Actualizar división</button>
        </div>}
        <div className="modal-scroll">
          {recibo ? (
            <BoletaInterna
              ticket={recibo.ticket}
              transaccion={recibo.transaccion}
              mesaNumero={mesaNumero}
              propina={recibo.propina}
              sede={sede}
              onCerrar={() => { if (recibo.cuentaCompleta) onClose(); else setRecibo(null); }}
            />
          ) : (
            <CobroBody
              loading={loading}
              online={online}
              cuentaActiva={cuentaActiva}
              items={itemsVisuales}
              subtotal={subtotal}
              descuento={descuento}
              setDescuento={setDescuento}
              propina={propina}
              setPropina={setPropina}
              totalCobro={totalCobro}
              igv={igv}
              metodo={metodo}
              setMetodo={setMetodo}
              modoPago={modoPago}
              cambiarModoPago={cambiarModoPago}
              distribucionPago={distribucionPago}
              setDistribucionPago={setDistribucionPago}
              totalDistribuido={totalDistribuido}
              cantidadMetodosDistribuidos={cantidadMetodosDistribuidos}
              diferenciaDistribucion={diferenciaDistribucion}
              efectivoEsperado={efectivoEsperado}
              usaEfectivo={usaEfectivo}
              documentoPanel={<DocumentoCobroSelector value={documento} onChange={setDocumento} sedeId={sede?.id} total={montoAPagar} />}
              documentoValido={documentoCompleto(documento, montoAPagar)}
              procesando={procesando || divisionQuery.loading || divisionQuery.saving || Boolean(divisionQuery.error) || partes.length === 0}
              recibido={recibido}
              setRecibido={setRecibido}
              vuelto={vuelto}
              faltaPago={faltaPago}
              onClose={onClose}
              onKey={key}
              onPagar={handlePagar}
              modoDivision={modoDivision}
              setModoDivision={(modo) => {
                if (modo === 'UNICO' && division && !divisionBloqueada) {
                  void divisionQuery.eliminar().then(() => setModoDivision(modo)).catch(err => toast({ title: 'No se pudo quitar la división', msg: err instanceof Error ? err.message : 'Reintenta', icon: 'Alert', kind: 'err' }));
                } else setModoDivision(modo);
              }}
              numPartes={numPartes}
              setNumPartes={setNumPartes}
              numComensales={numComensales}
              setNumComensales={setNumComensales}
              comensalPorItem={comensalPorItem}
              setComensalPorItem={setComensalPorItem}
              divisionBloqueada={divisionBloqueada}
              partes={partes}
              parteActual={parteActual}
              partesPagadas={partesPagadas}
              montoAPagar={montoAPagar}
              tipAPagar={tipAPagar}
              totalConTip={totalConTip}
              esUltimaParte={esUltimaParte}
            />
          )}
        </div>
      </dialog>
    </div>
  );
}

interface CobroBodyProps {
  loading: boolean;
  online: boolean;
  cuentaActiva: CuentaVM | null | undefined;
  items: PedidoItemVM[];
  subtotal: number;
  descuento: string;
  setDescuento: (v: string) => void;
  propina: string;
  setPropina: (v: string) => void;
  totalCobro: number;
  igv: number;
  metodo: MetodoPago;
  setMetodo: (m: MetodoPago) => void;
  modoPago: ModoPago;
  cambiarModoPago: (m: ModoPago) => void;
  distribucionPago: DistribucionPago;
  setDistribucionPago: (d: DistribucionPago) => void;
  totalDistribuido: number;
  cantidadMetodosDistribuidos: number;
  diferenciaDistribucion: number;
  efectivoEsperado: number;
  usaEfectivo: boolean;
  documentoPanel: ReactNode;
  documentoValido: boolean;
  procesando: boolean;
  recibido: string;
  setRecibido: (v: string) => void;
  vuelto: number;
  faltaPago: boolean;
  onClose: () => void;
  onKey: (d: string) => void;
  onPagar: () => void;
  modoDivision: ModoDivision;
  setModoDivision: (m: ModoDivision) => void;
  numPartes: number;
  setNumPartes: (n: number) => void;
  numComensales: number;
  setNumComensales: (n: number) => void;
  comensalPorItem: Record<string, number>;
  setComensalPorItem: (fn: (prev: Record<string, number>) => Record<string, number>) => void;
  divisionBloqueada: boolean;
  partes: Parte[];
  parteActual: Parte;
  partesPagadas: Parte[];
  montoAPagar: number;
  tipAPagar: number;
  totalConTip: number;
  esUltimaParte: boolean;
}

function CobroBody({
  loading, online, cuentaActiva, items,
  subtotal, descuento, setDescuento, propina, setPropina,
  totalCobro, igv, metodo, setMetodo,
  modoPago, cambiarModoPago, distribucionPago, setDistribucionPago,
  totalDistribuido, cantidadMetodosDistribuidos, diferenciaDistribucion, efectivoEsperado, usaEfectivo,
  documentoPanel, documentoValido, procesando,
  recibido, setRecibido, vuelto, faltaPago,
  onClose, onKey, onPagar,
  modoDivision, setModoDivision, numPartes, setNumPartes,
  numComensales, setNumComensales, comensalPorItem, setComensalPorItem,
  divisionBloqueada, partes, parteActual, partesPagadas,
  montoAPagar, tipAPagar, totalConTip, esUltimaParte,
}: Readonly<CobroBodyProps>) {
  if (loading && !cuentaActiva) {
    return <div style={{ padding: 40, textAlign: 'center' }} className="muted">Cargando cuenta…</div>;
  }
  if (!cuentaActiva) {
    return (
      <div className="empty" style={{ padding: 36 }}>
        <div className="e-ic"><Icons.Wallet s={26} /></div>
        <h3>Sin cuenta abierta</h3>
        <p>Esta mesa no tiene una cuenta activa.</p>
        <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
      </div>
    );
  }
  const puedeDividir = items.length > 0 && subtotal > 0;
  return (
    <div className="two-up" style={{ padding: 20, gap: 22 }}>
      <div>
        <div className="hint" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Detalle de la cuenta</div>
        <div className="panel cobro-items-list" style={{ padding: '4px 14px' }}>
          {items.length === 0 ? (
            <div className="muted" style={{ padding: 12, fontSize: 13 }}>La cuenta no tiene ítems.</div>
          ) : items.map((it) => (
            <div key={it.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <div className="dish-line" style={{ padding: 0, border: 'none' }}>
                <span className="dish-q">{it.cantidad}</span>
                <span style={{ flex: 1, fontWeight: 600 }}>{it.nombre}</span>
                <span className="mono" style={{ fontWeight: 700 }}>{fmt(it.subtotal)}</span>
              </div>
              {modoDivision === 'ITEMS' && (
                <div className="row" style={{ gap: 5, flexWrap: 'wrap', marginTop: 4, paddingLeft: 2 }}>
                  {Array.from({ length: numComensales }, (_, i) => i + 1).map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`chip ${(comensalPorItem[it.id] ?? 1) === c ? 'on' : ''}`}
                      style={{ padding: '3px 9px', fontSize: 12 }}
                      disabled={divisionBloqueada}
                      onClick={() => setComensalPorItem((prev) => ({ ...prev, [it.id]: c }))}
                    >
                      C{c}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ padding: '14px 4px 0' }}>
          <div className="kv"><span className="k">Subtotal</span><span className="v mono">{fmt(subtotal)}</span></div>
          <div className="kv"><span className="k">Descuento</span>
            <span className="v"><span className="input" style={{ padding: '4px 8px', width: 110 }}><span className="muted">S/</span><input value={descuento} disabled={divisionBloqueada} onChange={(e) => setDescuento(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" style={{ textAlign: 'right' }} /></span></span>
          </div>
          <div className="kv"><span className="k">Propina</span>
            <span className="v"><span className="input" style={{ padding: '4px 8px', width: 110 }}><span className="muted">S/</span><input value={propina} disabled={divisionBloqueada} onChange={(e) => setPropina(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" style={{ textAlign: 'right' }} /></span></span>
          </div>
          <div className="kv" style={{ borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 12 }}>
            <span className="k" style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Total</span>
            <span className="v mono" style={{ fontSize: 22, fontWeight: 800 }}>{fmt(totalCobro)}</span>
          </div>
          <div className="hint" style={{ textAlign: 'right', marginTop: 4 }}>Incluye IGV (18%): {fmt(igv)}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
        {puedeDividir && (
          <div>
            <div className="hint" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Cómo se divide la cuenta</div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {([
                { v: 'UNICO', l: 'Pago único' },
                { v: 'PARTES', l: 'Partes iguales' },
                { v: 'ITEMS', l: 'Por plato' },
              ] as { v: ModoDivision; l: string }[]).map((m) => (
                <button
                  key={m.v}
                  type="button"
                  className={`chip ${modoDivision === m.v ? 'on' : ''}`}
                  disabled={divisionBloqueada}
                  onClick={() => setModoDivision(m.v)}
                >
                  {m.l}
                </button>
              ))}
            </div>
            {modoDivision === 'PARTES' && (
              <div className="row" style={{ gap: 8, alignItems: 'center', marginTop: 8 }}>
                <span className="hint">Número de partes</span>
                <button type="button" className="btn btn-sm btn-ghost" disabled={divisionBloqueada || numPartes <= 2} onClick={() => setNumPartes(Math.max(2, numPartes - 1))}>−</button>
                <span className="mono" style={{ fontWeight: 800, minWidth: 18, textAlign: 'center' }}>{numPartes}</span>
                <button type="button" className="btn btn-sm btn-ghost" disabled={divisionBloqueada || numPartes >= 8} onClick={() => setNumPartes(Math.min(8, numPartes + 1))}>+</button>
              </div>
            )}
            {modoDivision === 'ITEMS' && (
              <div style={{ marginTop: 8 }}>
                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <span className="hint">Comensales</span>
                  <button type="button" className="btn btn-sm btn-ghost" disabled={divisionBloqueada || numComensales <= 2} onClick={() => setNumComensales(Math.max(2, numComensales - 1))}>−</button>
                  <span className="mono" style={{ fontWeight: 800, minWidth: 18, textAlign: 'center' }}>{numComensales}</span>
                  <button type="button" className="btn btn-sm btn-ghost" disabled={divisionBloqueada || numComensales >= 8} onClick={() => setNumComensales(Math.min(8, numComensales + 1))}>+</button>
                </div>
                <div className="hint" style={{ marginTop: 4 }}>Asigna cada plato a un comensal en la lista de la izquierda.</div>
              </div>
            )}
            {modoDivision !== 'UNICO' && partes.length === 0 && <p className="hint">Asigna al menos una unidad a cada comensal o cambia el número de partes.</p>}
            {modoDivision !== 'UNICO' && partes.length > 0 && (
              <div className="cuadre" style={{ marginTop: 10, padding: '10px 12px' }}>
                <div className="lbl">{parteActual.label} {partesPagadas.length > 0 && `(${partesPagadas.length}/${partes.length} cobradas)`}</div>
                <div className="big" style={{ fontSize: 20 }}>{fmt(montoAPagar + tipAPagar)}</div>
                {tipAPagar > 0 && <div className="hint">Incluye propina: {fmt(tipAPagar)}</div>}
              </div>
            )}
          </div>
        )}
        {documentoPanel}
        <div>
          <div className="row" style={{ marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
            <div className="hint" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em' }}>Método de pago</div>
            <span className="spacer" />
            <button type="button" className={`chip ${modoPago === 'UNICO' ? 'on' : ''}`} onClick={() => cambiarModoPago('UNICO')}>Pago único</button>
            <button type="button" className={`chip ${modoPago === 'COMBINADO' ? 'on' : ''}`} onClick={() => cambiarModoPago('COMBINADO')}>Combinar métodos</button>
          </div>
          {modoPago === 'UNICO' ? (
            <div className="method-grid">
              {METODOS.map((m) => {
                const Ic = Icons[m.ic];
                return (
                  <button key={m.value} className={`method-opt ${metodo === m.value ? 'on' : ''}`} onClick={() => setMetodo(m.value)}>
                    <span className="m-ic" style={{ background: m.color }}><Ic s={16} /></span>{m.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mixed-payment-grid">
              {METODOS.map((m) => {
                const Ic = Icons[m.ic];
                return (
                  <label key={m.value} className={`mixed-payment-row ${Number(distribucionPago[m.value]) > 0 ? 'on' : ''}`}>
                    <span className="m-ic" style={{ background: m.color }}><Ic s={15} /></span>
                    <span>{m.label}</span>
                    <span className="input mixed-payment-input"><span className="muted">S/</span><input
                      aria-label={`Monto ${m.label}`}
                      value={distribucionPago[m.value]}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^\d.]/g, '');
                        setDistribucionPago({ ...distribucionPago, [m.value]: value });
                        if (m.value === 'EFECTIVO') setRecibido(value);
                      }}
                      inputMode="decimal"
                      placeholder="0.00"
                    /></span>
                  </label>
                );
              })}
              <div className={`mixed-payment-summary ${cantidadMetodosDistribuidos >= 2 && Math.abs(diferenciaDistribucion) < 0.01 ? 'ok' : 'warn'}`}>
                <span>Distribuido <b className="mono">{fmt(totalDistribuido)}</b></span>
                <span>{cantidadMetodosDistribuidos < 2
                  ? 'Selecciona por lo menos dos métodos'
                  : Math.abs(diferenciaDistribucion) < 0.01
                    ? 'Cuadra con el total'
                    : `${diferenciaDistribucion > 0 ? 'Falta' : 'Excede'} ${fmt(Math.abs(diferenciaDistribucion))}`}</span>
              </div>
            </div>
          )}
        </div>
        {usaEfectivo && (
          <div className="cobro-keypad-layout" style={{ gap: 14 }}>
            <div>
              <div className="field" style={{ marginBottom: 8 }}><label htmlFor="cobro-recibido">Recibido en efectivo {modoPago === 'COMBINADO' && `(corresponde ${fmt(efectivoEsperado)})`}</label><div className="input"><span className="muted">S/</span><input id="cobro-recibido" value={recibido} onChange={(e) => setRecibido(e.target.value.replace(/[^\d.]/g, ''))} inputMode="none" style={{ fontSize: 18, fontWeight: 800 }} /></div></div>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {['exacto', 50, 100, 200].map((c) => <button key={c} className="chip" onClick={() => setRecibido(c === 'exacto' ? efectivoEsperado.toFixed(2) : String(c))}>{c === 'exacto' ? 'Exacto' : 'S/ ' + c}</button>)}
              </div>
              <div className="cuadre ok" style={{ marginTop: 12, padding: '12px 14px' }} aria-live="polite" aria-label={`Vuelto: ${vuelto > 0 ? 'S/ ' + vuelto.toFixed(2) : 'Sin vuelto'}`}>
                <div className="lbl">Vuelto</div><div className="big" style={{ fontSize: 26 }}>{fmt(vuelto)}</div>
              </div>
            </div>
            <div className="keypad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} onClick={() => onKey(d)}>{d}</button>)}
              <button onClick={() => onKey('.')}>.</button>
              <button onClick={() => onKey('0')}>0</button>
              <button onClick={() => onKey('C')}>C</button>
            </div>
          </div>
        )}
        <div style={{ display: 'grid', gap: 8 }}>
          {!online && (
            <div className="banner warn" role="alert">
              <Icons.Alert s={16} />
              <span>Sin conexión. Reconecta para registrar el pago.</span>
            </div>
          )}
          {faltaPago && online && (
            <div className="banner warn" role="status" aria-live="polite">
              <Icons.Alert s={16} />
              <span>{modoPago === 'COMBINADO'
                ? 'La distribución debe cuadrar con el total y el efectivo recibido debe cubrir su parte.'
                : <>El monto recibido es menor al total. Ingresa al menos <b className="mono">S/ {(totalConTip - Number(recibido || 0)).toFixed(2)}</b> más.</>}</span>
            </div>
          )}
          <button
            className="btn btn-primary btn-block"
            disabled={!cuentaActiva || loading || !online || faltaPago || !documentoValido || procesando}
            onClick={onPagar}
            aria-describedby="cobro-pago-hint"
          >
            {loading ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <Icons.Card s={16} />}
            {' '}{esUltimaParte ? 'Registrar pago y cerrar cuenta' : `Cobrar ${parteActual.label.toLowerCase()}`}
          </button>
          {(faltaPago || !online) && (
            <span id="cobro-pago-hint" className="hint" style={{ textAlign: 'center' }}>
              {online ? 'Completa el monto recibido para continuar.' : 'Requiere conexión a internet.'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
