import { Controller, UseInterceptors, Optional } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { RoutingKeys, MesaCreadaPayload, MesaActualizadaPayload, ProductoCreadoPayload, ProductoActualizadoPayload, StockInsuficientePayload, CuentaAsociadaPayload } from '@org/contracts';
import { AppService } from './app.service';
import { FusionPedidosService } from './fusion-pedidos.service';
import { RabbitMQRetryInterceptor } from '@org/resiliencia';

@UseInterceptors(RabbitMQRetryInterceptor)
@Controller()
export class EventsController {

  constructor(private readonly appService: AppService, @Optional() private readonly fusiones?: FusionPedidosService) {}

  @EventPattern(RoutingKeys.MesaCreada)
  async handleMesaCreada(@Payload() payload: MesaCreadaPayload) {
    await this.appService.upsertMesaLocal(payload.mesa);
  }

  @EventPattern(RoutingKeys.MesaActualizada)
  async handleMesaActualizada(@Payload() payload: MesaActualizadaPayload) {
    await this.appService.upsertMesaLocal(payload.mesa);
    await this.fusiones?.limpiarAliasMesa(payload.mesa);
  }

  @EventPattern(RoutingKeys.ProductoCreado)
  async handleProductoCreado(@Payload() payload: ProductoCreadoPayload) {
    await this.appService.procesarProductoCreado(payload);
  }

  @EventPattern(RoutingKeys.ProductoActualizado)
  async handleProductoActualizado(@Payload() payload: ProductoActualizadoPayload) {
    await this.appService.procesarProductoActualizado(payload);
  }

  @EventPattern(RoutingKeys.StockInsuficiente)
  async handleStockInsuficiente(@Payload() payload: StockInsuficientePayload) {
    await this.appService.procesarStockInsuficiente(payload);
  }

  @EventPattern(RoutingKeys.CuentaAsociada)
  async handleCuentaAsociada(@Payload() payload: CuentaAsociadaPayload) {
    await this.appService.procesarCuentaAsociada(payload);
  }
}
