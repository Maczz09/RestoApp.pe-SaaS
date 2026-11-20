import { useCallback, useEffect, useRef, useState } from 'react';
import { alertasSonoras, registrarActivacionPorGesto } from '../services/alertasSonoras.service';

export function useSolicitudesSonido(ids: string[] | undefined) {
  const anteriores = useRef<Set<string> | null>(null);
  const [activo, setActivo] = useState(() => alertasSonoras.activa());
  const activar = useCallback(async () => setActivo(await alertasSonoras.activar(true)), []);
  const desactivar = useCallback(async () => { await alertasSonoras.desactivar(); setActivo(false); }, []);
  useEffect(() => {
    if (!alertasSonoras.preferidas() || activo) return;
    return registrarActivacionPorGesto(() => setActivo(true));
  }, [activo]);
  useEffect(() => {
    if (!ids) return;
    if (anteriores.current && ids.some(id => !anteriores.current!.has(id))) alertasSonoras.tocar(['PENDIENTE']);
    anteriores.current = new Set(ids);
  }, [ids]);
  return { activo, activar, desactivar };
}
