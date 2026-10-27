const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { randomUUID } = require('node:crypto');

async function main() {
  const email = (process.env.PLATFORM_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.PLATFORM_ADMIN_PASSWORD || '';
  if (!email || email.includes('REPLACE_ME') || password.length < 16 || password.includes('REPLACE_ME')) throw new Error('Configura PLATFORM_ADMIN_EMAIL y una contraseña de al menos 16 caracteres.');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT id, rol FROM "Usuario" WHERE email = $1 FOR UPDATE', [email]);
    if (existing.rowCount) {
      if (existing.rows[0].rol !== 'PLATFORM_ADMIN') throw new Error('Ese correo pertenece a un usuario de restaurante. No se cambiará su rol.');
      console.log('La cuenta de plataforma ya existe. Su contraseña no fue modificada.');
    } else {
      const id = randomUUID();
      await client.query('INSERT INTO "Usuario" (id,nombre,email,password,rol,activo,"failedLoginAttempts","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,true,0,now(),now())', [id, 'Superadministrador RestoApp', email, await bcrypt.hash(password, 12), 'PLATFORM_ADMIN']);
      await client.query('INSERT INTO "AuditoriaLog" (id,accion,"usuarioId",servicio,resultado,"createdAt") VALUES ($1,$2,$3,$4,$5,now())', [randomUUID(), 'PLATFORM_BOOTSTRAP_VPS', id, 'servicio-identidad', 'OK']);
      console.log('Superadministrador creado sin tenant, sede ni datos de demostración.');
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); await pool.end(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
