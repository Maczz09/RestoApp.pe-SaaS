const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const connectionString = process.env.DATABASE_URL || 'postgresql://restoapp:secret@localhost:5439/identidad_db?schema=public';

async function seed() {
  const pool = new Pool({ connectionString });
  try {
    console.log('🌱 Inicializando seed de usuarios y tenant para RestoApp...');

    // Superadministrador global. No tiene membresía ni sede, por lo que el
    // login emite una sesión PLATFORM y nunca cae en el tenant demo.
    const isProduction = process.env.NODE_ENV === 'production';
    const platformEmail = process.env.PLATFORM_ADMIN_EMAIL ||
      (isProduction ? null : 'superadmin@restoapp.local');
    const configuredPlatformPassword = process.env.PLATFORM_ADMIN_PASSWORD ||
      (isProduction ? null : 'restoapp-platform-2026');
    if (!platformEmail || (isProduction && !configuredPlatformPassword)) {
      throw new Error(
        'En producción son obligatorias PLATFORM_ADMIN_EMAIL y PLATFORM_ADMIN_PASSWORD.'
      );
    }

    const existingPlatform = await pool.query(
      'SELECT id FROM "Usuario" WHERE email = $1 LIMIT 1',
      [platformEmail]
    );
    const platformPassword = configuredPlatformPassword;
    let platformUserId;

    if (existingPlatform.rowCount > 0) {
      platformUserId = existingPlatform.rows[0].id;
      if (configuredPlatformPassword) {
        const hash = await bcrypt.hash(configuredPlatformPassword, 12);
        await pool.query(
          `UPDATE "Usuario"
           SET nombre = 'Superadministrador RestoApp', password = $1,
               rol = 'PLATFORM_ADMIN', activo = true, "failedLoginAttempts" = 0,
               "lockedUntil" = null, "sedeId" = null, "updatedAt" = now()
           WHERE id = $2`,
          [hash, platformUserId]
        );
      } else {
        await pool.query(
          `UPDATE "Usuario"
           SET nombre = 'Superadministrador RestoApp', rol = 'PLATFORM_ADMIN',
               activo = true, "failedLoginAttempts" = 0, "lockedUntil" = null,
               "sedeId" = null, "updatedAt" = now()
           WHERE id = $1`,
          [platformUserId]
        );
      }
    } else {
      const hash = await bcrypt.hash(platformPassword, 12);
      const platformInsert = await pool.query(
        `INSERT INTO "Usuario"
          (id, nombre, email, password, rol, activo, "failedLoginAttempts", "sedeId", "createdAt", "updatedAt")
         VALUES
          (gen_random_uuid()::text, 'Superadministrador RestoApp', $1, $2,
           'PLATFORM_ADMIN', true, 0, null, now(), now())
         RETURNING id`,
        [platformEmail, hash]
      );
      platformUserId = platformInsert.rows[0].id;
    }

    // Una cuenta de plataforma no hereda acceso a ningún restaurante.
    await pool.query('DELETE FROM "membresias" WHERE "usuarioId" = $1', [platformUserId]);
    console.log(`   ✅ Superadministrador de plataforma: ${platformEmail}`);
    console.log(isProduction
      ? '   🔐 Contraseña tomada de PLATFORM_ADMIN_PASSWORD.'
      : '   🔐 Desarrollo local: restoapp-platform-2026');

    // Retira exclusivamente las cuentas de demostración de la marca anterior.
    // No toca usuarios reales ni hace un reset general de la base.
    const legacyEmails = [
      'admin@nachopps.pe',
      'mesero@nachopps.pe',
      'cajero@nachopps.pe',
      'cocina@nachopps.pe',
      'recepcion@nachopps.pe',
      'gerencia@nachopps.pe',
    ];
    await pool.query(
      'DELETE FROM "refresh_tokens" WHERE "userId" IN (SELECT id FROM "Usuario" WHERE email = ANY($1::text[]))',
      [legacyEmails]
    );
    await pool.query(
      'DELETE FROM "AuditoriaLog" WHERE "usuarioId" IN (SELECT id FROM "Usuario" WHERE email = ANY($1::text[]))',
      [legacyEmails]
    );
    const legacyCleanup = await pool.query(
      'DELETE FROM "Usuario" WHERE email = ANY($1::text[]) RETURNING id',
      [legacyEmails]
    );
    if (legacyCleanup.rowCount > 0) {
      console.log(`   🧹 ${legacyCleanup.rowCount} cuenta(s) demo legacy eliminada(s)`);
    }

    const tenantId = '00000000-0000-0000-0000-000000000001';
    const sedeId = '00000000-0000-0000-0000-000000000001';

    // 1. Asegurar Tenant Demo
    await pool.query(
      'UPDATE "tenant_domains" SET principal = false, "updatedAt" = now() WHERE "tenantId" = $1 AND domain <> $2',
      [tenantId, 'restoapp-demo.restoapp.pe']
    );
    await pool.query(
      `
      INSERT INTO "tenants" (id, nombre, slug, ruc, activo, plan, "createdAt", "updatedAt")
      VALUES ($1, 'RestoApp Demo', 'restoapp-demo', '20123456789', true, 'ENTERPRISE', now(), now())
      ON CONFLICT (id) DO UPDATE
      SET nombre = EXCLUDED.nombre,
          slug = EXCLUDED.slug,
          activo = true,
          plan = EXCLUDED.plan,
          "updatedAt" = now();
      `,
      [tenantId]
    );
    console.log('   ✅ Tenant demo configurado');

    await pool.query(
      `
      INSERT INTO "tenant_domains"
        (id, "tenantId", domain, activo, principal, "createdAt", "updatedAt")
      VALUES
        (gen_random_uuid()::text, $1, 'restoapp-demo.restoapp.pe', true, true, now(), now())
      ON CONFLICT (domain) DO UPDATE
      SET "tenantId" = EXCLUDED."tenantId",
          activo = true,
          principal = true,
          "updatedAt" = now();
      `,
      [tenantId]
    );
    console.log('   ✅ Subdominio demo configurado');

    // 2. Asegurar Sede Principal asignada al Tenant
    await pool.query(
      `
      INSERT INTO "sedes" (id, "tenantId", nombre, direccion, ruc, activa, "createdAt", "updatedAt")
      VALUES ($1, $2, 'Sede Principal', 'Av. Gastronomía 123, Miraflores', '20123456789', true, now(), now())
      ON CONFLICT (id) DO UPDATE
      SET "tenantId" = EXCLUDED."tenantId",
          activa = true,
          "updatedAt" = now();
      `,
      [sedeId, tenantId]
    );
    console.log('   ✅ Sede principal vinculada al tenant');

    // 3. Hashes para passwords
    const hashRestoApp = await bcrypt.hash('restoapp123', 10);

    const usuarios = [
      // Usuarios oficiales RestoApp
      { nombre: 'Administrador General', email: 'admin@restoapp.pe', password: hashRestoApp, rol: 'ADMIN' },
      { nombre: 'Mesero Salón', email: 'mesero@restoapp.pe', password: hashRestoApp, rol: 'MESERO' },
      { nombre: 'Cajero Principal', email: 'cajero@restoapp.pe', password: hashRestoApp, rol: 'CAJERO' },
      { nombre: 'Jefe de Cocina', email: 'cocina@restoapp.pe', password: hashRestoApp, rol: 'COCINA' },
      { nombre: 'Recepción Host', email: 'recepcion@restoapp.pe', password: hashRestoApp, rol: 'RECEPCION' },
      { nombre: 'Gerente de Operaciones', email: 'gerencia@restoapp.pe', password: hashRestoApp, rol: 'GERENCIA' },
    ];

    for (const u of usuarios) {
      // Upsert Usuario
      const userRes = await pool.query(
        `
        INSERT INTO "Usuario" (id, nombre, email, password, rol, activo, "failedLoginAttempts", "sedeId", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, $1, $2, $3, $4, true, 0, $5, now(), now())
        ON CONFLICT (email) DO UPDATE
        SET nombre = EXCLUDED.nombre,
            password = EXCLUDED.password,
            rol = EXCLUDED.rol,
            activo = true,
            "failedLoginAttempts" = 0,
            "lockedUntil" = null,
            "sedeId" = EXCLUDED."sedeId",
            "updatedAt" = now()
        RETURNING id;
        `,
        [u.nombre, u.email, u.password, u.rol, sedeId]
      );
      const usuarioId = userRes.rows[0].id;

      // Upsert Membresia
      const membRes = await pool.query(
        `
        INSERT INTO "membresias" (id, "tenantId", "usuarioId", rol, activo, "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, $1, $2, $3, true, now(), now())
        ON CONFLICT ("tenantId", "usuarioId") DO UPDATE
        SET rol = EXCLUDED.rol,
            activo = true,
            "updatedAt" = now()
        RETURNING id;
        `,
        [tenantId, usuarioId, u.rol]
      );
      const membresiaId = membRes.rows[0].id;

      // Upsert MembresiaSede
      await pool.query(
        `
        INSERT INTO "membresias_sedes" (id, "membresiaId", "sedeId", "createdAt")
        VALUES (gen_random_uuid()::text, $1, $2, now())
        ON CONFLICT ("membresiaId", "sedeId") DO NOTHING;
        `,
        [membresiaId, sedeId]
      );

      console.log(`   ✅ Usuario registrado: ${u.email.padEnd(24)} | Rol: ${u.rol}`);
    }

    console.log('\n🎉 Seed completado exitosamente.');
  } catch (err) {
    console.error('❌ Error ejecutando seed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
