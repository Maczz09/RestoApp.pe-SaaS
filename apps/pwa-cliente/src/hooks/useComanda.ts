// hooks/useComanda.ts — Estado y orquestación de la toma de pedido del Comandero.
// Concentra el estado del carrito y del contexto por canal, los derivados
// (totales, validez, puedeEnviar) y el envío, apoyándose en domain/comanda
// para toda la lógica pura. Extraído del Comandero en T-22.

import { useMemo, useState } from 'react';
import type { ToastOptions } from '../components/ui/ToastProvider';
import type { MesaVM } from '../types/mesa.types';
import type { ProductoVM } from '../types/inventario.types';
import type { CrearPedidoPayload } from '../types/pedido.types';
import type { Canal } from '../domain/pedido.flow';
import * as comanda from '../domain/comanda';
import type { CartLine } from '../domain/comanda';
import { fmt } from '../utils/format';

export interface UseComandaParams {
  mesaId?: string;
  mesaLock: boolean;
  initialCanal: Canal;
  modoAgregar: boolean;
  mesaNumero?: string;
  mesas: MesaVM[];
  mesasFisicas: MesaVM[];
  crear: (payload: CrearPedidoPayload) => Promise<unknown>;
  toast: (opts: ToastOptions) => void;
  onCreated?: () => void;
  onClose: () => void;
}

export function useComanda(p: UseComandaParams) {
  const [canal, setCanal] = useState<Canal>(p.mesaLock ? 'SALON' : p.initialCanal);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [saving, setSaving] = useState(false);

  // Contexto por canal
  const [selMesaId, setSelMesaId] = useState<string>(p.mesaId ?? '');
  const [comensales, setComensales] = useState(2);
  const [cliente, setCliente] = useState('');
  const [tel, setTel] = useState('');
  const [dir, setDir] = useState('');
  const [referencia, setReferencia] = useState('');
  const [proveedor, setProveedor] = useState('Propio');
  const [retiro, setRetiro] = useState('');

  // Mesa efectiva por defecto en SALON
  const effectiveMesaId = p.mesaLock ? p.mesaId! : selMesaId || p.mesasFisicas[0]?.id || '';
  const { subtotal, igv, totalItems } = useMemo(() => comanda.calcTotales(lines), [lines]);

  const addProducto = (prod: ProductoVM) => setLines((ls) => comanda.addProducto(ls, prod));
  const incLine = (id: string, d: number) => setLines((ls) => comanda.incLine(ls, id, d));
  const delLine = (id: string) => setLines((ls) => comanda.delLine(ls, id));
  const setNota = (id: string, notas: string) => setLines((ls) => comanda.setNota(ls, id, notas));
  const setNotaUnidad = (id: string, unidad: number, notas: string) => setLines((ls) => comanda.setNotaUnidad(ls, id, unidad, notas));
  const toggleNote = (id: string) => setLines((ls) => comanda.toggleNote(ls, id));
  const vaciar = () => setLines([]);

  const ctxValido = comanda.contextoValido(canal, { effectiveMesaId, cliente, dir });
  const puedeEnviar = lines.length > 0 && ctxValido && !saving;

  const enviar = async () => {
    const targetMesaId = comanda.resolveTargetMesaId(canal, effectiveMesaId, p.mesas);
    if (!targetMesaId) {
      p.toast({
        title: 'No se pudo enviar',
        msg: canal === 'SALON' ? 'Selecciona una mesa' : 'Mesa virtual no encontrada (recarga)',
        icon: 'Alert',
        kind: 'err',
      });
      return;
    }

    setSaving(true);
    try {
      await p.crear({
        mesaId: targetMesaId,
        items: comanda.buildItems(lines),
        cliente: canal !== 'SALON' && cliente.trim() ? cliente.trim() : undefined,
        telefono: canal !== 'SALON' && tel.trim() ? tel.trim() : undefined,
        direccion: canal === 'DELIVERY' && dir.trim() ? dir.trim() : undefined,
        proveedor: canal === 'DELIVERY' ? proveedor : undefined,
        modalidad: canal,
      });
      p.toast({
        title: p.modoAgregar ? `Agregado a Mesa ${p.mesaNumero ?? ''}`.trim() : 'Pedido enviado a cocina',
        msg: `${totalItems} ítem(s) · ${fmt(subtotal)}`,
        icon: 'Check',
      });
      p.onCreated?.();
      p.onClose();
    } catch (err) {
      p.toast({
        title: 'Error al enviar',
        msg: err instanceof Error ? err.message : 'Inténtalo de nuevo',
        icon: 'Alert',
        kind: 'err',
      });
    } finally {
      setSaving(false);
    }
  };

  return {
    canal, setCanal,
    lines, addProducto, incLine, delLine, setNota, setNotaUnidad, toggleNote, vaciar,
    selMesaId, setSelMesaId,
    comensales, setComensales,
    cliente, setCliente, tel, setTel, dir, setDir,
    referencia, setReferencia, proveedor, setProveedor, retiro, setRetiro,
    effectiveMesaId, subtotal, igv, totalItems, ctxValido, puedeEnviar, saving, enviar,
  };
}
