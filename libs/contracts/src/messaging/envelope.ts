/** Metadatos en eventos de dominio con soporte SaaS Multi-tenant. */
export interface EventMetadata {
  eventId?: string;
  eventType?: string;
  schemaVersion?: string;
  tenantId?: string;
  sedeId?: string;
  actorId?: string;
  correlationId?: string;
  causationId?: string;
  occurredAt: string;
  producer?: string;
  idempotencyKey?: string;
}

/**
 * Formato estándar de mensaje NestJS RMQ + publicador interno con aislamiento multitenant.
 * @see ADR-004, ADR-007, PLAN_RESTOAPP_SAAS_MULTITENANT (Sección 4.6)
 */
export interface DomainEventEnvelope<TPayload> {
  pattern: string;
  data: TPayload;
  metadata?: EventMetadata;
  tenantId?: string;
  sedeId?: string;
}

export function createEventEnvelope<TPayload>(
  pattern: string,
  data: TPayload,
  producer?: string,
  tenantId?: string,
  sedeId?: string,
): DomainEventEnvelope<TPayload> {
  return {
    pattern,
    data,
    tenantId,
    sedeId,
    metadata: {
      occurredAt: new Date().toISOString(),
      producer,
      tenantId,
      sedeId,
    },
  };
}
