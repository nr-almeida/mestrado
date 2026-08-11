import { DomainEvent } from '../../domain/events/DomainEvent';

/**
 * Porta de saída para publicação de eventos de domínio. Em produção,
 * corresponde ao tópico Kafka onde `ServicoAccounting` publica
 * `CreditReserved`/`CreditRejected` (ver EC-M5.2). Nesta primeira
 * versão, um EventBus em memória cumpre esse papel.
 */
export interface EventPublisher {
  publish(event: DomainEvent): Promise<void>;
}
