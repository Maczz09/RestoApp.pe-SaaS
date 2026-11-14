-- Only accounts with NO membership can be inferred safely from their own branch.
-- Never reactivate disabled memberships, move accounts, or change passwords.
WITH repaired AS (
  INSERT INTO membresias (id, "tenantId", "usuarioId", rol, activo, "createdAt", "updatedAt")
  SELECT gen_random_uuid()::text, s."tenantId", u.id, u.rol, u.activo, now(), now()
  FROM "Usuario" u JOIN sedes s ON s.id = u."sedeId"
  WHERE s."tenantId" IS NOT NULL
    AND u.rol IN ('ADMIN', 'GERENCIA', 'CAJERO', 'MESERO', 'COCINA', 'RECEPCION')
    AND NOT EXISTS (SELECT 1 FROM membresias m WHERE m."usuarioId" = u.id)
  ON CONFLICT ("tenantId", "usuarioId") DO NOTHING
  RETURNING id, "usuarioId", "tenantId"
), assigned AS (
  INSERT INTO membresias_sedes (id, "membresiaId", "sedeId", "createdAt")
  SELECT gen_random_uuid()::text, r.id, u."sedeId", now()
  FROM repaired r JOIN "Usuario" u ON u.id = r."usuarioId"
  RETURNING id
)
INSERT INTO "AuditoriaLog" (id, "tenantId", accion, "usuarioId", servicio, resultado, "createdAt")
SELECT gen_random_uuid()::text, "tenantId", 'REPARAR_MEMBRESIA_EQUIPO', "usuarioId", 'servicio-identidad', 'OK', now()
FROM repaired;
