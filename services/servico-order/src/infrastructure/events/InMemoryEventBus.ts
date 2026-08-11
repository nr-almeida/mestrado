import { DomainEvent } from '../../domain/events/DomainEvent';
import { EventPublisher } from '../../application/ports/EventPublisher';

type Handler = (event: DomainEvent) => void | Promise<void>;

/**
 * Event bus em memória. Cumpre dois papéis nesta primeira versão do
 * estudo de caso (apenas o ServicoOrder implementado):
 *
 *  1. Como adaptador da porta EventPublisher, registra os eventos que
 *     o ServicoOrder publicaria no tópico Kafka `order_events`
 *     (OrderCreated, OrderApproved, OrderCancelled, OrderDelivered).
 *  2. Como painel de inspeção para provar, em testes e demonstrações,
 *     que os eventos certos foram publicados na ordem certa — ver
 *     `getPublishedEvents()`.
 *
 * Quando os demais microsserviços (Accounting, Kitchen, Delivery,
 * Restaurant, Consumer) forem implementados, este adaptador é
 * substituído por um produtor/consumidor Kafka real, sem alterar a
 * camada de aplicação (que depende apenas da interface EventPublisher).
 */
export class InMemoryEventBus implements EventPublisher {
  private readonly handlers = new Map<string, Handler[]>();
  private readonly published: DomainEvent[] = [];

  async publish(event: DomainEvent): Promise<void> {
    this.published.push(event);
    const handlers = this.handlers.get(event.type) ?? [];
    for (const handler of handlers) {
      await handler(event);
    }
  }

  subscribe(eventType: string, handler: Handler): void {
    const current = this.handlers.get(eventType) ?? [];
    current.push(handler);
    this.handlers.set(eventType, current);
  }

  getPublishedEvents(): DomainEvent[] {
    return [...this.published];
  }

  clear(): void {
    this.published.length = 0;
  }
}
