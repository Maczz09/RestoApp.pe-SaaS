import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { client } from '../../api/client';
import type { ConfigDivisionCuenta, DivisionCuentaDto } from '@org/contracts';

export const DIVISION_CUENTA_KEY = ['division-cuenta'];

export function useDivisionCuenta(cuentaId?: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: [...DIVISION_CUENTA_KEY, cuentaId],
    enabled: Boolean(cuentaId),
    queryFn: () => client.get<DivisionCuentaDto | null>(`/caja/division-cuenta/${cuentaId}`),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (config: ConfigDivisionCuenta) => client.patch<DivisionCuentaDto>(`/caja/division-cuenta/${cuentaId}`, config),
    onSuccess: value => queryClient.setQueryData([...DIVISION_CUENTA_KEY, cuentaId], value),
  });
  const extension = useMutation({
    mutationFn: (version: number) => client.post<DivisionCuentaDto>(`/caja/division-cuenta/${cuentaId}/ampliar`, { version }),
    onSuccess: value => queryClient.setQueryData([...DIVISION_CUENTA_KEY, cuentaId], value),
  });
  return {
    division: query.data ?? null,
    loading: query.isLoading,
    saving: mutation.isPending || extension.isPending,
    error: query.error?.message ?? mutation.error?.message ?? extension.error?.message ?? null,
    guardar: mutation.mutateAsync,
    ampliar: extension.mutateAsync,
    eliminar: async () => {
      await client.delete(`/caja/division-cuenta/${cuentaId}`);
      queryClient.setQueryData([...DIVISION_CUENTA_KEY, cuentaId], null);
    },
    refetch: () => { mutation.reset(); extension.reset(); return query.refetch(); },
    invalidar: () => queryClient.invalidateQueries({ queryKey: [...DIVISION_CUENTA_KEY, cuentaId] }),
  };
}
