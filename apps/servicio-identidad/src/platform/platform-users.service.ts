import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

interface CreatePlatformAdminInput { nombre: string; email: string; password: string; }

@Injectable()
export class PlatformUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const users = await this.prisma.usuario.findMany({ where: { rol: 'PLATFORM_ADMIN' }, orderBy: { createdAt: 'asc' }, select: { id: true, nombre: true, email: true, activo: true, createdAt: true } });
    return users;
  }

  async create(input: CreatePlatformAdminInput, actorId: string) {
    const nombre = input.nombre?.trim();
    const email = input.email?.trim().toLowerCase();
    if (!nombre || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Nombre o correo inválido');
    if (!input.password || input.password.length < 12) throw new BadRequestException('La contraseña debe tener al menos 12 caracteres');
    const password = await bcrypt.hash(input.password, 12);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.usuario.create({ data: { nombre, email, password, rol: 'PLATFORM_ADMIN', activo: true }, select: { id: true, nombre: true, email: true, activo: true, createdAt: true } });
        await tx.auditoriaLog.create({ data: { accion: 'PLATFORM_ADMIN_CREADO', usuarioId: actorId, servicio: 'servicio-identidad', recurso: 'Usuario', recursoId: user.id, detalle: JSON.stringify({ email }) } });
        return user;
      });
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') throw new ConflictException('Ese correo ya está registrado');
      throw error;
    }
  }

  async setStatus(userId: string, activo: boolean, actorId: string) {
    if (typeof activo !== 'boolean') throw new BadRequestException('Estado inválido');
    if (!activo && userId === actorId) throw new ForbiddenException('No puedes desactivar tu propia cuenta');
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.usuario.findUnique({ where: { id: userId } });
      if (!user || user.rol !== 'PLATFORM_ADMIN') throw new NotFoundException('Superadministrador no encontrado');
      if (!activo && user.activo && await tx.usuario.count({ where: { rol: 'PLATFORM_ADMIN', activo: true } }) <= 1) throw new ConflictException('Debe quedar al menos un superadministrador activo');
      const changed = await tx.usuario.update({ where: { id: userId }, data: { activo }, select: { id: true, nombre: true, email: true, activo: true, createdAt: true } });
      if (!activo) await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditoriaLog.create({ data: { accion: activo ? 'PLATFORM_ADMIN_ACTIVADO' : 'PLATFORM_ADMIN_DESACTIVADO', usuarioId: actorId, servicio: 'servicio-identidad', recurso: 'Usuario', recursoId: userId } });
      return changed;
    });
  }

  async resetPassword(userId: string, password: string, actorId: string) {
    if (!password || password.length < 12) throw new BadRequestException('La contraseña debe tener al menos 12 caracteres');
    const hash = await bcrypt.hash(password, 12);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.usuario.findUnique({ where: { id: userId } });
      if (!user || user.rol !== 'PLATFORM_ADMIN') throw new NotFoundException('Superadministrador no encontrado');
      await tx.usuario.update({ where: { id: userId }, data: { password: hash, failedLoginAttempts: 0, lockedUntil: null } });
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditoriaLog.create({ data: { accion: 'PLATFORM_ADMIN_CLAVE_RESTABLECIDA', usuarioId: actorId, servicio: 'servicio-identidad', recurso: 'Usuario', recursoId: userId } });
      return { success: true };
    });
  }
}
