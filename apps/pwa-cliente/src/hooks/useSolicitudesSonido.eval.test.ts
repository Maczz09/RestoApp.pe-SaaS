// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSolicitudesSonido } from './useSolicitudesSonido';
import { alertasSonoras } from '../services/alertasSonoras.service';
vi.mock('../services/alertasSonoras.service', () => ({ alertasSonoras: { activa: () => true, preferidas: () => true, tocar: vi.fn(), activar: vi.fn(), desactivar: vi.fn() }, registrarActivacionPorGesto: vi.fn() }));
describe('REST-106, sonido de una cuenta nueva', () => {
  beforeEach(() => vi.clearAllMocks());
  it('timbra una vez al llegar una solicitud, sin repetir por polling o cambios de total', () => {
    const { rerender } = renderHook(({ ids }) => useSolicitudesSonido(ids), { initialProps: { ids: [] as string[] } });
    rerender({ ids: ['cuenta1'] });
    expect(alertasSonoras.tocar).toHaveBeenCalledExactlyOnceWith(['PENDIENTE']);
    rerender({ ids: ['cuenta1'] });
    rerender({ ids: [] });
    expect(alertasSonoras.tocar).toHaveBeenCalledTimes(1);
    rerender({ ids: ['cuenta2'] });
    expect(alertasSonoras.tocar).toHaveBeenCalledTimes(2);
  });
  it('no confunde las solicitudes históricas de la primera carga con cuentas nuevas', () => {
    renderHook(() => useSolicitudesSonido(['antigua']));
    expect(alertasSonoras.tocar).not.toHaveBeenCalled();
  });
});
