import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface PlatformRequest {
  user?: {
    rol?: string;
    sessionScope?: string;
    tenantId?: string | null;
    sub?: string;
  };
}

/** Acepta únicamente tokens de plataforma, nunca un rol del tenant. */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(@Optional() private readonly prisma?: PrismaService) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const request = context.switchToHttp().getRequest<PlatformRequest>();
    const user = request.user;

    if (
      !user ||
      user.rol !== 'PLATFORM_ADMIN' ||
      user.sessionScope !== 'PLATFORM' ||
      user.tenantId != null
    ) {
      throw new ForbiddenException('Se requiere una sesión de administrador de plataforma');
    }

    if (!this.prisma) return true;
    if (!user.sub) throw new ForbiddenException('Falta la identidad de plataforma');
    return this.prisma.usuario.findUnique({ where: { id: user.sub }, select: { rol: true, activo: true } }).then((current) => {
      if (!current?.activo || current.rol !== 'PLATFORM_ADMIN') throw new ForbiddenException('La cuenta de plataforma está desactivada');
      return true;
    });
  }
}
