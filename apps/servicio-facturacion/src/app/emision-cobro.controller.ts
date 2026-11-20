import { BadRequestException, Body, Controller, ForbiddenException, NotFoundException, Param, ParseUUIDPipe, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { IsString, Matches } from 'class-validator';
import { RoutingKeys, type PedidoSnapshotItem } from '@org/contracts';
import { Roles, RolesGuard, TenantActual } from '@org/shared-auth';
import { UsuarioActual } from '@org/observabilidad';
import { RabbitMQRetryInterceptor } from '@org/resiliencia';
import { EmisionService } from './emision.service';
import { PrismaService } from '../prisma/prisma.service';
import { CertificadoService } from '../sunat/certificado.service';
import { EmitirComprobanteDto } from './dto/emitir-comprobante.dto';

class ValidarEmisorCommand {
  @IsString() tenantId: string;
  @IsString() sedeId: string;
  @Matches(/^\d{11}$/) empresaRuc: string;
}

interface EmisionCobro extends ValidarEmisorCommand {
  cobroId: string;
  cuentaId: string;
  mesaId: string;
  tipo: 'BOLETA' | 'FACTURA';
  total: number;
  items: PedidoSnapshotItem[];
  clienteDocumento?: string;
  clienteNombre?: string;
  clienteRazonSocial?: string;
}

@Controller('comprobantes')
@UseGuards(RolesGuard)
export class EmisionCobroController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emision: EmisionService,
    private readonly certificado: CertificadoService,
  ) {}

  @Post('validar-emisor')
  @Roles('SISTEMA')
  async validar(@UsuarioActual() usuarioId: string, @Body() command: ValidarEmisorCommand) {
    if (usuarioId !== 'servicio-caja') throw new ForbiddenException('Solo Caja puede validar este emisor.');
    const empresa = await this.prisma.empresa.findFirst({ where: {
      tenantId: command.tenantId, sedeId: command.sedeId, ruc: command.empresaRuc, activo: true,
    } });
    if (!empresa) throw new BadRequestException('No existe un emisor activo para esta sede.');
    try { await this.certificado.clavesParaSlot(empresa.slot); }
    catch { throw new BadRequestException('El emisor no tiene un certificado utilizable.'); }
    return { disponible: true };
  }

  @UseInterceptors(RabbitMQRetryInterceptor)
  @EventPattern(RoutingKeys.EmisionCobroSolicitada)
  async emitirDesdeCaja(@Payload() cobro: EmisionCobro) {
    const solicitud: EmitirComprobanteDto = {
      tipoComprobante: cobro.tipo, empresaRuc: cobro.empresaRuc,
      ...(cobro.tipo === 'FACTURA' ? { clienteRuc: cobro.clienteDocumento, clienteRazonSocial: cobro.clienteRazonSocial }
        : { clienteDni: cobro.clienteDocumento, clienteNombre: cobro.clienteNombre }),
    };
    // New documents are referenced by the settlement id. Keep the original
    // account id separately so the ledger can trace several documents per table.
    await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${cobro.cobroId}, 101))`;
      const snapshot = await tx.comprobantePago.upsert({
        where: { cuentaId: cobro.cobroId },
        create: {
          cuentaId: cobro.cobroId, cuentaOrigenId: cobro.cuentaId, tenantId: cobro.tenantId,
          sedeId: cobro.sedeId, mesaId: cobro.mesaId, total: cobro.total,
          items: JSON.parse(JSON.stringify(cobro.items)),
          solicitudEmision: JSON.parse(JSON.stringify(solicitud)),
        },
        update: {},
      });
      if (snapshot.estado === 'EMITIDO') return;
      // Commit the snapshot before emission, which reads it via the Prisma pool.
    });
    await this.emision.emitirDesdeCobro(cobro.cobroId, solicitud, cobro.sedeId, cobro.tenantId);
  }

  @Post(':cobroId/reintentar-cobro')
  @Roles('ADMIN', 'CAJERO')
  async reintentar(
    @Param('cobroId', ParseUUIDPipe) cobroId: string,
    @TenantActual() tenantId?: string | null,
    @UsuarioActual('sedeId') sedeId?: string | null,
  ) {
    if (!tenantId) throw new ForbiddenException('Selecciona un restaurante.');
    const registro = await this.prisma.comprobantePago.findFirst({
      where: { cuentaId: cobroId, tenantId, ...(sedeId ? { sedeId } : {}), cuentaOrigenId: { not: null } },
      include: { comprobante: true },
    });
    if (!registro?.solicitudEmision) throw new NotFoundException('Cobro electrónico no encontrado.');
    if (!registro.comprobante) {
      await this.emision.emitirDesdeCobro(cobroId, registro.solicitudEmision as unknown as EmitirComprobanteDto, registro.sedeId, tenantId);
    } else if (registro.comprobante.estado === 'FIRMADO' && registro.comprobante.intentos >= 5) {
      await this.prisma.comprobante.updateMany({ where: { id: registro.comprobante.id, estado: 'FIRMADO', intentos: { gte: 5 } }, data: { intentos: 0 } });
    }
    return { message: 'Se ha revisado la cola de emisión para este cobro.' };
  }
}
