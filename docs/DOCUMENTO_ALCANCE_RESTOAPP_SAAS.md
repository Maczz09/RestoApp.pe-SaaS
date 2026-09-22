# DOCUMENTO DE ALCANCE TÉCNICO Y FUNCIONAL
## PLATAFORMA RESTOAPP.PE SAAS MULTITENANT

![RestoApp Logo](../apps/pwa-cliente/public/brand/RestoApp%20para%20modo%20claro.png)

---

### 1. INFORMACIÓN GENERAL Y TITULARIDAD LEGAL

| Concepto | Detalle |
|---|---|
| **Nombre del Software** | RestoApp.pe (Plataforma Web SaaS para Restaurantes) |
| **Versión Técnica** | 1.0.0 (Base SaaS Multitenant Unificada) |
| **Fecha de Emisión** | 22 de septiembre de 2026 |
| **Titular de Propiedad Intelectual** | **Max García López** (Autor, diseñador de arquitectura y titular exclusivo de todos los derechos de autor, código fuente, esquemas de bases de datos, algoritmos y documentación técnica). |
| **Entidad Distribuidora Autorizada** | **Mavric** (Entidad autorizada para la comercialización, distribución, soporte operativo, facturación a clientes finales y licenciamiento del software). |
| **Estado Comercial** | **Pendiente de definición de planes y empaquetamiento comercial**. |

---

### 2. DECLARACIÓN DE PROPIEDAD INTELECTUAL Y RÉGIMEN DE DISTRIBUCIÓN

1. **Titularidad de Derechos**:  
   El software **RestoApp.pe**, su código fuente distribuido en monorepo, contratos, esquemas de persistencia Prisma, configuraciones de infraestructura, interfaces de usuario PWA y componentes de observabilidad son **propiedad intelectual exclusiva de Max García López**. Queda prohibida la reproducción, copia total o parcial de código o cesión no autorizada fuera del marco establecido.

2. **Canal de Distribución**:  
   La comercialización del servicio SaaS se gestionará a través de **Mavric**, actuando como el canal oficial de comercialización, distribución comercial, gestión de relaciones con clientes y operación de ventas del producto en el mercado.

3. **Definición de Planes Comerciales (Pendiente)**:  
   Queda expresamente asentado que la **estructura de planes de suscripción** (nombres comerciales, tarifas, límites de sedes, volumen mensual de comprobantes electrónicos, usuarios permitidos y asignación de módulos por nivel) **se encuentra pendiente de formalización comercial**. Este documento cubre el alcance funcional construido y operativo a la fecha.

---

### 3. ARQUITECTURA GENERAL DEL SISTEMA

RestoApp.pe está construido bajo una arquitectura modular de servicios independientes sobre una base de datos PostgreSQL por servicio con aislamiento estricto de inquilinos (`tenantId`):

- **Modelo Multitenant**: Un mismo motor de software atiende a múltiples empresas o grupos restauranteros con segregación lógica de datos en reposo y en tránsito.
- **Frontend PWA Multiplataforma**: Aplicación web progresiva (React 19 + TypeScript + Vite) con diseño responsive para computadoras de escritorio, tablets y teléfonos móviles. Soporta instalación local y funcionamiento desconectado con caché segmentada.
- **Mensajería y Eventos Asíncronos**: Broker RabbitMQ para sincronización de inventario, emisión fiscal y trazabilidad con outbox transaccional.
- **Tiempo Real**: WebSockets dedicados por tenant y sede para comanderas, cocina y actualizaciones de estado de mesas.
- **Seguridad**: Autenticación criptográfica con tokens JWT RS256, rotación de refresh tokens en cookies seguras httpOnly, protección contra CSRF y cifrado de claves fiscales con AES-256-GCM.

---

### 4. INVENTARIO FUNCIONAL: MÓDULOS INCLUIDOS

El sistema operativo RestoApp.pe contiene 11 módulos de dominio y capacidades transversales operativas:

#### 4.1. Control Plane, Identidad y Membresías (`servicio-identidad`)
- Onboarding inicial: registro asistido de empresa, primera sede y cuenta administradora.
- Gestión de membresías: asociación de un mismo usuario a múltiples restaurantes sin duplicidad de credenciales.
- Selector dinámico de restaurante y sede (`TenantSwitcher` y `SedeSwitcher`) con purga de caché automática al alternar contexto.
- Control de acceso basado en roles: Administrador de Plataforma, Administrador de Restaurante, Cajero, Mesero, Cocina, Recepción y Gerencia.

#### 4.2. Salón y Mesas (`servicio-mesas`)
- Distribución de salón por áreas o pisos físicos.
- Estados de mesa en tiempo real: Libre, Ocupada, Reservada, En Atención y Por Cobrar.
- Fusión y separación de mesas para grupos de comensales.
- Historial de rotación y tiempos de permanencia.

#### 4.3. Comandero y Gestión de Pedidos (`servicio-pedidos`)
- Comandero táctil optimizado para velocidad de ingreso de ítems.
- Manejo de notas de cocina, términos de preparación y especificaciones por plato.
- Soporte para tres canales de consumo: Salón (mesa), Para Llevar (Takeout) y Delivery.
- Auditoría estricta de anulaciones: registro de motivo, usuario que solicita, aprobador y fecha/hora.

#### 4.4. Pantalla de Cocina / KDS y Despacho (`servicio-pedidos` + `pwa-cliente`)
- Visualización de pedidos en tiempo real clasificados por tiempo de espera con semaforización visual.
- Alertas sonoras configurables para ingreso de nuevas comandas y estados urgentes.
- Cola de impresión térmica de comandas para tickets de barra y cocina, con reintentos y compatibilidad con impresoras de red o locales.

#### 4.5. Caja y Control de Turnos (`servicio-caja`)
- Ciclo de caja por turno: apertura con monto base, arqueo ciego y cierre Z formal.
- Registro de transacciones: ingresos, salidas de caja menor y gastos operativos.
- Conciliación de métodos de pago: efectivo, tarjetas de crédito/débito, transferencias y billeteras digitales (Yape, Plin).
- Generación e impresión de reportes de cierre de turno y comprobantes internos.

#### 4.6. Cuentas y Cobros (`servicio-cuentas`)
- División de cuentas flexibles: por consumo individual, división equitativa entre personas o selección ítem por ítem.
- Control de propinas y cargos por servicio.
- Conciliación automática entre estado de cuenta y liberación de mesa.

#### 4.7. Carta y Catálogo con Tamaños (`servicio-inventario`)
- Organización por categorías de productos y cartas configurables.
- Gestión de platos con múltiples tamaños y presentaciones (ej. Personal, Mediano, Familiar) con precios independientes.
- Menú diario configurable para platos del día y promociones por franja horaria.

#### 4.8. Carta Pública Digital por Código QR (`servicio-inventario` + `pwa-cliente`)
- Acceso público para clientes finales mediante lectura de código QR de mesa o enlace web.
- Visualización de precios, fotos, descripciones e ingredientes sin necesidad de iniciar sesión ni instalar apps.
- Actualización automática en vivo de disponibilidad de platos vía WebSocket.

#### 4.9. Inventario, Insumos, Kardex y Mermas (`servicio-inventario`)
- Catálogo de insumos clasificados por unidad de medida y almacén de origen (almacén central vs. cocina).
- Kardex de movimientos: entradas por compra, salidas automáticas por recetas y ajustes de inventario.
- Módulo integral de mermas: registro clasificado de desperdicios, motivos y valorización económica.
- Exportación de kardex y stock a formatos descargables.

#### 4.10. Compras y Proveedores (`servicio-compras`)
- Catálogo de proveedores con validación de RUC y datos de contacto.
- Órdenes de compra: ciclo borrador, emitida, recepción parcial, recepción total y anulada.
- Almacenamiento digital de fotografías de facturas y guías físicas de compra asociadas a cada ingreso.

#### 4.11. Facturación Electrónica SUNAT (`servicio-facturacion`)
- Soporte para dos empresas fiscales o RUCs independientes por sede operativa.
- Credenciales SOL y certificados digitales de firma electrónica cifrados en base de datos.
- Generación automática de XML conforme a estándar UBL 2.1 para:
  - Boletas de Venta Electrónicas
  - Facturas Electrónicas
  - Notas de Crédito Electrónicas
  - Notas de Débito Electrónicas
- Comunicación directa SOAP con los servidores de SUNAT, recepción y archivo de Constancias de Recepción (CDR).
- Generación de representación impresa (PDF y formato ticket 80mm) con código QR tributario y hash digital.

#### 4.12. Reservas de Salón (`servicio-reservas`)
- Calendario de reservas con control de capacidad por turno y fecha.
- Asignación anticipada de mesas y confirmación de llegada.
- Bloqueo preventivo de mesas para evitar sobreventas en salón.

#### 4.13. Reportes y Analítica Gerencial (`servicio-reportes`)
- Resumen consolidado de ventas por rango de fechas (diario, semanal, mensual, anual).
- Reportes de ventas por producto, categoría y volumen.
- Estadísticas de rendimiento y volumen atendido por mesero.
- Métricas de ocupación, horas pico y tiempos de atención.
- Exportación de reportes a PDF y formatos compatibles con hojas de cálculo.

#### 4.14. Notificaciones y Alertas en Tiempo Real (`servicio-notificaciones`)
- Conexión WebSocket bidireccional agrupada por salas de restaurante y sede.
- Alertas inmediatas de nuevos pedidos para cocina y caja.
- Notificaciones de solicitud de cuenta y llamados de atención de meseros.

---

### 5. PUNTOS PENDIENTES DE DEFINICIÓN COMERCIAL

Los siguientes aspectos comerciales están pendientes de formalización entre **Max García López** y **Mavric** previo al lanzamiento público:

1. **Estructura de Planes de Suscripción**:
   - Definición del esquema de empaquetamiento (ejemplo sugerido: *Plan Básico / Emprendedor*, *Plan Profesional*, *Plan Multi-Sede / Enterprise*).
   - Nivel de acceso a módulos avanzados según el plan contratado (ejemplo: si Facturación Electrónica multi-RUC o Carta Pública QR se consideran complementos o funciones base).
2. **Políticas de Cuotas y Límites por Plan**:
   - Límite de sedes operativas permitidas.
   - Cantidad de usuarios simultáneos o cuentas de meseros incluidas.
   - Volumen máximo de emisión mensual de comprobantes electrónicos SUNAT sin cargo adicional.
   - Capacidad de almacenamiento para adjuntos de comprobantes de compras.
3. **Precios y Períodos de Cobro**:
   - Fijación de tarifas mensuales, trimestrales y anuales en moneda local (PEN) y moneda internacional (USD).
   - Políticas de soporte técnico, capacitación de personal y acuerdos de nivel de servicio (SLA).

---

### 6. CONFORMIDAD Y FIRMAS

El presente documento deja constancia técnica del estado actual y capacidades funcionales del software **RestoApp.pe**.

<br><br><br>

| __________________________________________ | __________________________________________ |
| :--- | :--- |
| **Max García López** | **Mavric** |
| Titular de Propiedad Intelectual | Distribución Comercial y Operaciones |
| Autor del Software | Representante Autorizado |
