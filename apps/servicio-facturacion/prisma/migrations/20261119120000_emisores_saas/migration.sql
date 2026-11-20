-- Keep historical slot numbers and credential references. New issuers receive
-- a globally unique slot, independent of restaurant and branch count.
CREATE SEQUENCE empresas_slot_seq;
SELECT setval('empresas_slot_seq', COALESCE((SELECT MAX(slot) FROM empresas), 0) + 1, false);
ALTER TABLE empresas ALTER COLUMN slot SET DEFAULT nextval('empresas_slot_seq');
ALTER SEQUENCE empresas_slot_seq OWNED BY empresas.slot;
DROP INDEX "empresas_ruc_key";
CREATE UNIQUE INDEX "empresas_tenantId_ruc_key" ON empresas("tenantId", ruc);
