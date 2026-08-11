/**
 * Contrato genérico de evento de domínio, no mesmo formato usado pelo
 * ServicoOrder (ver services/servico-order/src/domain/events/DomainEvent.ts),
 * para que os eventos publicados por um serviço possam ser
 * repassados ao outro sem transformação de formato — ver
 * scripts/demo-order-accounting-flow.sh na raiz do monorepo.
 */
export interface DomainEvent<TPayload = unknown> {
  type: string;
  aggregateId: string;
  occurredAt: string;
  payload: TPayload;
}

export function createEvent<TPayload>(
  type: string,
  aggregateId: string,
  payload: TPayload
): DomainEvent<TPayload> {
  return {
    type,
    aggregateId,
    occurredAt: new Date().toISOString(),
    payload,
  };
}
