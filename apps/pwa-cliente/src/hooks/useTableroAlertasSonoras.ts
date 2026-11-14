import { useCallback, useEffect, useRef, useState } from 'react';
import { etapasQueIngresan, snapshotTablero, type SnapshotTablero, type TableroSonoro } from '../domain/alertasTablero';
import { alertasSonoras, registrarActivacionPorGesto } from '../services/alertasSonoras.service';
import type { PedidoVM } from '../types/pedido.types';

export function useTableroAlertasSonoras(pedidos: PedidoVM[], { tablero, listo }: { tablero: TableroSonoro; listo: boolean }) {
  const anteriorRef = useRef<SnapshotTablero | null>(null);
  const [activo, setActivo] = useState(() => alertasSonoras.activa());
  const activar = useCallback(async () => setActivo(await alertasSonoras.activar(true)), []);
  const desactivar = useCallback(async () => { await alertasSonoras.desactivar(); setActivo(false); }, []);

  useEffect(() => {
    if (!alertasSonoras.preferidas() || activo) return;
    return registrarActivacionPorGesto(() => setActivo(true));
  }, [activo]);

  useEffect(() => {
    if (!listo) return;
    const actual = snapshotTablero(tablero, pedidos);
    if (anteriorRef.current === null) {
      anteriorRef.current = actual;
      return;
    }
    const etapas = etapasQueIngresan(anteriorRef.current, actual);
    anteriorRef.current = actual;
    if (etapas.length) alertasSonoras.tocar(etapas);
  }, [listo, pedidos, tablero]);

  return { sonidoActivo: activo, activarSonido: activar, desactivarSonido: desactivar };
}
