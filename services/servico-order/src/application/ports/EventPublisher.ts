import { DomainEvent } from '../../domain/events/DomainEvent';

/**
 * Porta de saída para publicação de eventos de domínio. Em produção,
 * corresponde ao tópico Kafka `order_events` (ver EC-M5.2). Nesta
 * primeira versão, um EventBus em memória cumpre esse papel e também
 * é usado para simular a chegada de eventos de outros bounded
 * contexts ainda não implementados (Accounting, Kitchen, Delivery).
 */
export interface EventPublisher {
  publish(event: DomainEvent): Promise<void>;
}
