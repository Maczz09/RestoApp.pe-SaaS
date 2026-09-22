import { Controller, Get, Post, Body, Param, Patch, Delete, Query, UseGuards } from '@nestjs/common';
import { Roles, RolesGuard, TenantActual } from '@org/shared-auth';
import { UsuarioActual } from '@org/observabilidad';
import { AppService } from './app.service';
import {
  CrearCategoriaCommand,
  ActualizarCategoriaCommand,
  CrearProductoCommand,
  ActualizarProductoCommand,
  ActualizarDisponibilidadCommand,
  ListarProductosQuery,
  ObtenerProductosLoteCommand,
  AgregarAlMenuCommand,
  ActualizarMenuDiarioCommand,
  RegistrarMermaCommand,
  ActualizarMermaCommand,
  EliminarMermaCommand,
  ListarMermasQuery,
  CrearTamanoPlatoCommand,
  ActualizarTamanoPlatoCommand,
} from '@org/contracts';

// Lectura del catálogo: la usan inventario/carta (admin, sistema, gerencia) y
// también el comandero del PWA (cajero, mesero) al armar pedidos. COCINA
// también necesita leer (Carta, para marcar 86) aunque solo pueda escribir
// disponibilidad — ver los @Roles de método más abajo. La gestión del
// catálogo (mutaciones) queda restringida a administración por método.
// T-23 (multi-sede): listar/crear reciben `sedeId` por query — el servicio la
// resuelve contra `req.user.sedeId` (usuario pineado gana siempre; el admin
// general debe indicarla).
@UseGuards(RolesGuard)
@Roles('ADMIN', 'SISTEMA', 'GERENCIA', 'CAJERO', 'MESERO', 'COCINA')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getData() {
    return this.appService.getHello();
  }

  // --- CATEGORÍAS ---

  @Get('categorias')
  listarCategorias(
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
    @TenantActual() tenantId?: string | null,
  ) {
    if (tenantId !== undefined) {
      return this.appService.listarCategorias(usuarioSedeId, sedeId, tenantId);
    }
    return this.appService.listarCategorias(usuarioSedeId, sedeId);
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Post('categorias')
  crearCategoria(
    @Body() body: CrearCategoriaCommand,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
    @TenantActual() tenantId?: string | null,
  ) {
    if (tenantId !== undefined) {
      return this.appService.crearCategoria(body, usuarioSedeId, sedeId, tenantId);
    }
    return this.appService.crearCategoria(body, usuarioSedeId, sedeId);
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Patch('categorias/:id')
  actualizarCategoria(@Param('id') id: string, @Body() body: ActualizarCategoriaCommand) {
    return this.appService.actualizarCategoria(id, body);
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Delete('categorias/:id')
  eliminarCategoria(@Param('id') id: string) {
    return this.appService.eliminarCategoria(id);
  }

  // --- PRODUCTOS ---

  @Get('tamanos-plato')
  listarTamanosPlato(
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
    @TenantActual() tenantId?: string | null,
  ) {
    if (tenantId !== undefined) {
      return this.appService.listarTamanosPlato(usuarioSedeId, sedeId, tenantId);
    }
    return this.appService.listarTamanosPlato(usuarioSedeId, sedeId);
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Post('tamanos-plato')
  crearTamanoPlato(
    @Body() body: CrearTamanoPlatoCommand,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
    @TenantActual() tenantId?: string | null,
  ) {
    if (tenantId !== undefined) {
      return this.appService.crearTamanoPlato(body, usuarioSedeId, sedeId, tenantId);
    }
    return this.appService.crearTamanoPlato(body, usuarioSedeId, sedeId);
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Patch('tamanos-plato/:id')
  actualizarTamanoPlato(
    @Param('id') id: string,
    @Body() body: ActualizarTamanoPlatoCommand,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
  ) {
    return this.appService.actualizarTamanoPlato(id, body, usuarioSedeId, sedeId);
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Delete('tamanos-plato/:id')
  eliminarTamanoPlato(
    @Param('id') id: string,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
  ) {
    return this.appService.eliminarTamanoPlato(id, usuarioSedeId, sedeId);
  }

  @Get('productos')
  listarProductos(
    @Query() query: ListarProductosQuery,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @UsuarioActual('rol') rol: string | null,
    @Query('sedeId') sedeId?: string,
    @TenantActual() tenantId?: string | null,
  ) {
    const queryEfectiva = rol === 'COCINA' ? { ...query, conStock: false } : query;
    if (tenantId !== undefined) {
      return this.appService.listarProductos(queryEfectiva, usuarioSedeId, sedeId, tenantId);
    }
    return this.appService.listarProductos(queryEfectiva, usuarioSedeId, sedeId);
  }

  @Get('productos/:id')
  obtenerProducto(
    @Param('id') id: string,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
    @TenantActual() tenantId?: string | null,
  ) {
    if (tenantId !== undefined) {
      return this.appService.obtenerProducto(id, usuarioSedeId, sedeId, tenantId);
    }
    return this.appService.obtenerProducto(id, usuarioSedeId, sedeId);
  }

  // Consulta por lote: la invoca servicio-pedidos con token SISTEMA (cold-start).
  @Post('productos/lote')
  obtenerProductosLote(
    @Body() body: ObtenerProductosLoteCommand,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
    @TenantActual() tenantId?: string | null,
  ) {
    if (tenantId !== undefined) {
      return this.appService.obtenerProductosLote(body.ids, usuarioSedeId, sedeId, tenantId);
    }
    return this.appService.obtenerProductosLote(body.ids, usuarioSedeId, sedeId);
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Post('productos')
  crearProducto(
    @Body() body: CrearProductoCommand,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
    @TenantActual() tenantId?: string | null,
  ) {
    if (tenantId !== undefined) {
      return this.appService.crearProducto(body, usuarioSedeId, sedeId, tenantId);
    }
    return this.appService.crearProducto(body, usuarioSedeId, sedeId);
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Patch('productos/:id/stock')
  actualizarStock(
    @Param('id') id: string,
    @Body('stock') stock: number,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
  ) {
    return this.appService.actualizarStock(id, stock, usuarioSedeId, sedeId);
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Patch('productos/:id')
  actualizarProducto(
    @Param('id') id: string,
    @Body() body: ActualizarProductoCommand,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
  ) {
    return this.appService.actualizarProducto(id, body, usuarioSedeId, sedeId);
  }

  // Acotado a solo el flag `disponible` (a diferencia de PATCH productos/:id,
  // que también acepta nombre/precio/categoría) para que COCINA pueda marcar
  // 86 (agotado) sin poder editar el resto del plato.
  @Roles('ADMIN', 'SISTEMA', 'GERENCIA', 'COCINA')
  @Patch('productos/:id/disponibilidad')
  actualizarDisponibilidadProducto(
    @Param('id') id: string,
    @Body() body: ActualizarDisponibilidadCommand,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
  ) {
    return this.appService.actualizarProducto(id, { disponible: body.disponible }, usuarioSedeId, sedeId);
  }

  // --- MENÚ DEL DÍA ---

  @Get('menu-diario')
  listarMenuDelDia(
    @Query('fecha') fecha: string | undefined,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
    @TenantActual() tenantId?: string | null,
  ) {
    if (tenantId !== undefined) {
      return this.appService.listarMenuDelDia(fecha, usuarioSedeId, sedeId, tenantId);
    }
    return this.appService.listarMenuDelDia(fecha, usuarioSedeId, sedeId);
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Post('menu-diario')
  agregarAlMenu(
    @Body() body: AgregarAlMenuCommand,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
    @TenantActual() tenantId?: string | null,
  ) {
    if (tenantId !== undefined) {
      return this.appService.agregarAlMenu(body, usuarioSedeId, sedeId, tenantId);
    }
    return this.appService.agregarAlMenu(body, usuarioSedeId, sedeId);
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA', 'COCINA')
  @Patch('menu-diario/:id')
  actualizarMenuDiario(@Param('id') id: string, @Body() body: ActualizarMenuDiarioCommand) {
    return this.appService.actualizarMenuDiario(id, body);
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Delete('menu-diario/:id')
  quitarDelMenu(@Param('id') id: string) {
    return this.appService.quitarDelMenu(id);
  }

  // --- MERMA DE INVENTARIO ---

  @Get('mermas')
  listarMermas(
    @Query() query: ListarMermasQuery,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
    @TenantActual() tenantId?: string | null,
  ) {
    if (tenantId !== undefined) {
      return this.appService.listarMermas(query, usuarioSedeId, sedeId, tenantId);
    }
    return this.appService.listarMermas(query, usuarioSedeId, sedeId);
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Post('mermas')
  registrarMerma(
    @Body() body: RegistrarMermaCommand,
    @UsuarioActual() usuarioId: string | null,
    @UsuarioActual('nombre') usuarioNombre: string | null,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
    @TenantActual() tenantId?: string | null,
  ) {
    if (tenantId !== undefined) {
      return this.appService.registrarMerma(body, usuarioId, usuarioNombre, usuarioSedeId, sedeId, tenantId);
    }
    return this.appService.registrarMerma(body, usuarioId, usuarioNombre, usuarioSedeId, sedeId);
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Patch('mermas/:id')
  actualizarMerma(
    @Param('id') id: string,
    @Body() body: ActualizarMermaCommand,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
  ) {
    return this.appService.actualizarMerma(id, body, usuarioSedeId, sedeId);
  }

  @Roles('ADMIN', 'SISTEMA', 'GERENCIA')
  @Post('mermas/:id/eliminar')
  eliminarMerma(
    @Param('id') id: string,
    @Body() body: EliminarMermaCommand,
    @UsuarioActual('sedeId') usuarioSedeId: string | null,
    @Query('sedeId') sedeId?: string,
  ) {
    return this.appService.eliminarMerma(id, body.justificacion, usuarioSedeId, sedeId);
  }
}
