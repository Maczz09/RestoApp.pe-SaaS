const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const connectionString = process.env.DATABASE_URL || 'postgresql://restoapp:secret@localhost:5439/identidad_db?schema=public';

async function seed() {
  const pool = new Pool({ connectionString });
  try {
    console.log('🌱 Inicializando seed de usuarios y tenant para RestoApp...');

    const tenantId = '00000000-0000-0000-0000-000000000001';
    const sedeId = '00000000-0000-0000-0000-000000000001';

    // 1. Asegurar Tenant Demo
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
    const hashNachoPps = await bcrypt.hash('nachopps123', 10);

    const usuarios = [
      // Usuarios oficiales RestoApp
      { nombre: 'Administrador General', email: 'admin@restoapp.pe', password: hashRestoApp, rol: 'ADMIN' },
      { nombre: 'Mesero Salón', email: 'mesero@restoapp.pe', password: hashRestoApp, rol: 'MESERO' },
      { nombre: 'Cajero Principal', email: 'cajero@restoapp.pe', password: hashRestoApp, rol: 'CAJERO' },
      { nombre: 'Jefe de Cocina', email: 'cocina@restoapp.pe', password: hashRestoApp, rol: 'COCINA' },
      { nombre: 'Recepción Host', email: 'recepcion@restoapp.pe', password: hashRestoApp, rol: 'RECEPCION' },
      { nombre: 'Gerente de Operaciones', email: 'gerencia@restoapp.pe', password: hashRestoApp, rol: 'GERENCIA' },

      // Compatibilidad con scripts y tests legacy
      { nombre: 'Admin Legacy', email: 'admin@nachopps.pe', password: hashNachoPps, rol: 'ADMIN' },
      { nombre: 'Mesero Legacy', email: 'mesero@nachopps.pe', password: hashNachoPps, rol: 'MESERO' },
      { nombre: 'Cajero Legacy', email: 'cajero@nachopps.pe', password: hashNachoPps, rol: 'CAJERO' },
      { nombre: 'Cocina Legacy', email: 'cocina@nachopps.pe', password: hashNachoPps, rol: 'COCINA' },
      { nombre: 'Recepción Legacy', email: 'recepcion@nachopps.pe', password: hashNachoPps, rol: 'RECEPCION' },
      { nombre: 'Gerencia Legacy', email: 'gerencia@nachopps.pe', password: hashNachoPps, rol: 'GERENCIA' },
    ];

    for (const u of usuarios) {
      // Upsert Usuario
      const userRes = await pool.query(
        `
        INSERT INTO "Usuario" (id, nombre, email, password, rol, activo, "failedLoginAttempts", "sedeId", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, $1, $2, $3, $4, true, 0, $5, now(), now())
        ON CONFLICT (email) DO UPDATE
        SET password = EXCLUDED.password,
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
