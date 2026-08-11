/**
 * Contrato genérico de evento de domínio publicado pelo ServicoOrder,
 * alinhado com a especificação de eventos da Tabela "Especificação final
 * dos microsserviços do FTGO" (EC-M4.3).
 *
 * Em produção, cada evento seria publicado em um tópico Kafka
 * (ex.: `order_events`), conforme definido na EC-M5.2. Nesta primeira
 * versão (apenas o ServicoOrder), a publicação ocorre em um EventBus
 * em memória (ver src/infrastructure/events/InMemoryEventBus.ts),
 * substituível por um adaptador Kafka real quando os demais
 * microsserviços (Accounting, Kitchen, Delivery, Restaurant, Consumer)
 * forem implementados.
 */
export interface DomainEvent<TPayload = unknown> {
  /** Nome do evento (ex.: "OrderCreated"), conforme linguagem ubíqua do FTGO */
  type: string;
  /** Identificador do agregado que originou o evento */
  aggregateId: string;
  /** Momento em que o evento foi gerado */
  occurredAt: string;
  /** Dados específicos do evento */
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
