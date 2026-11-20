CREATE TABLE fusiones_mesas (
  id TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "sedeId" TEXT NOT NULL, "actorId" TEXT NOT NULL,
  "maestraMesaId" TEXT NOT NULL, "maestraCuentaId" TEXT NOT NULL,
  "mesaIds" JSONB NOT NULL, "cuentaIds" JSONB NOT NULL,
  "pedidoIds" JSONB NOT NULL DEFAULT '[]', huellas JSONB NOT NULL DEFAULT '{}',
  estado TEXT NOT NULL DEFAULT 'PENDIENTE', "ultimoError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX fusiones_mesas_estado_updatedAt_idx ON fusiones_mesas(estado, "updatedAt");
CREATE TABLE fusion_mesa_reservas ("mesaId" TEXT PRIMARY KEY, "fusionId" TEXT NOT NULL);
CREATE INDEX fusion_mesa_reservas_fusionId_idx ON fusion_mesa_reservas("fusionId");

-- Every writer (including pre-existing endpoints and event consumers) uses the
-- same lock as saga preparation. Only the coordinator may update a reserved row.
CREATE FUNCTION bloquear_mesa_en_fusion() RETURNS TRIGGER AS $$
DECLARE fusion TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('fusion:' || OLD.id));
  SELECT "fusionId" INTO fusion FROM fusion_mesa_reservas WHERE "mesaId" = OLD.id;
  IF fusion IS NOT NULL AND fusion IS DISTINCT FROM current_setting('app.fusion_id', true) THEN
    RAISE EXCEPTION 'La mesa tiene una unión en curso' USING ERRCODE = '40001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER mesas_bloqueo_fusion BEFORE UPDATE ON mesas FOR EACH ROW EXECUTE FUNCTION bloquear_mesa_en_fusion();
