// types/usuario.types.ts - DTOs y ViewModels de usuarios

import type {
  RolUsuario as ContractRolUsuario,
  UsuarioDto as ContractUsuarioDto,
  ListarUsuariosQuery as ContractListarUsuariosQuery,
  UsuarioListResponse as ContractUsuarioListResponse,
  CrearUsuarioCommand as ContractCrearUsuarioCommand,
  CambiarRolCommand as ContractCambiarRolCommand,
  CambiarEstadoUsuarioCommand as ContractCambiarEstadoUsuarioCommand,
} from '@org/contracts';

export type RolUsuario = ContractRolUsuario;
export type UsuarioDto = ContractUsuarioDto;
export type ListarUsuariosQuery = ContractListarUsuariosQuery;
export type UsuarioListResponse = ContractUsuarioListResponse;
export type CrearUsuarioPayload = ContractCrearUsuarioCommand;
export type EditarUsuarioPayload = Omit<CrearUsuarioPayload, 'password'> & { password?: string };
export type CambiarRolPayload = ContractCambiarRolCommand;
export type CambiarEstadoPayload = ContractCambiarEstadoUsuarioCommand;

export interface UsuarioVM {
  telefono?: string | null;
  id: string;
  nombre: string;
  email: string;
  rol: RolUsuario;
  rolLabel: string;
  activo: boolean;
  estadoLabel: string;
  estadoClass: string;
  createdAt: string;
  createdAtLabel: string;
  /** null = admin general (sin sede fija). T-23. */
  sedeId: string | null;
}
