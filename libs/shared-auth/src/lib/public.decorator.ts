import { SetMetadata } from '@nestjs/common';

/** Clave de metadata donde se indica si un endpoint o controller es público. */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca un endpoint o controller como público, evitando la validación de JwtAuthGuard.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
