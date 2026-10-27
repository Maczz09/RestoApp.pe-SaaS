#!/bin/sh
set -eu
export PGPASSWORD="${DB_PASS:?DB_PASS requerido}"
backup_stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_target="/backups/$backup_stamp"
mkdir -p "$backup_target"
for db in identidad mesas pedidos cuentas reservas inventario notificaciones caja reportes facturacion compras; do
  pg_dump -h "db-$db" -U "${DB_USER:-restoapp}" -d "${db}_db" -Fc -f "$backup_target/$db.dump"
  echo "OK $db"
done
tar -czf "$backup_target/comprobantes.tar.gz" -C /data/comprobantes .
echo "Backup completo: $backup_target. Copiar fuera del VPS junto con las claves de cifrado."
