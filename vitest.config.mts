import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

// Zona horaria del negocio (restobar en Lima, UTC-5). Fija el TZ del runner para
// que los tests sensibles a la hora (p.ej. reportes ventasPorHora/turno) sean
// deterministas en cualquier máquina/CI, no dependientes del TZ del sistema.
process.env.TZ = 'America/Lima';

export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: {
          syntax: 'typescript',
          decorators: true,
          decoratorsBeforeExport: true,
        },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
        target: 'es2021',
      },
      module: {
        type: 'es6',
      },
    }),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  esbuild: false,
  // Desactivar oxc para suprimir el warning de vitest 3/4
  oxc: false,
  test: {
    globals: true,
    environment: 'node',
    include: [
      'apps/servicio-*/src/**/*.spec.ts',
      'apps/pwa-cliente/src/**/*.spec.ts',
      'libs/*/src/**/*.spec.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*-e2e/**'],
    onConsoleLog: () => false,
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage',
      include: [
        'apps/servicio-{pedidos,caja,cuentas,inventario,identidad,mesas,reservas,notificaciones,reportes}/src/**/*.ts',
        'apps/pwa-cliente/src/**/*.ts',
        'libs/shared-auth/src/**/*.ts',
      ],
      exclude: [
        '**/*.spec.ts',
        '**/main.ts',
        '**/generated/**',
        '**/prisma/**',
        '**/filters/**',
        '**/types/**',
      ],
      // Pisos anti-regresión calibrados a la cobertura real actual del workspace
      // (medida sobre *.ts de los 9 servicios + shared-auth + pwa-cliente).
      // OBJETIVO: subir progresivamente hacia 80% a medida que se añaden pruebas.
      // No bajar estos números; solo subirlos cuando la cobertura real lo permita.
      // Escalón 1 (2026-06-07): +roles.guard, +helmet.config, +permisos,
      // +pedido.flow, +7 mappers PWA → ~43% branches, ~40% stmts.
      // Escalón 2 (2026-06-07): +outbox.processor ×7 servicios, +outbox-admin,
      // +outbox-alert → ~46% branches, ~54% stmts (medido en PR de rama).
      // Calibración dev→main (2026-06-07): al incluir todas las fuentes del
      // pwa-cliente (reescritura UI), el denominador de cobertura crece y los
      // porcentajes bajan ligeramente. Valores medidos en CI: stmts 52.88%,
      // lines 53.44%, branches 45.20%. Umbrales = medición − 1pp de margen.
      // Escalón 3 (pendiente): use*Query + *.api.ts → objetivo ~60-70%.
      thresholds: {
        branches: 45,
        functions: 38,
        lines: 53,
        statements: 52,
      },
    },
  },
});
