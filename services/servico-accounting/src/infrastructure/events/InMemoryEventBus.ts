import { DomainEvent } from '../../domain/events/DomainEvent';
import { EventPublisher } from '../../application/ports/EventPublisher';

/**
 * Event bus em memória. Registra os eventos que o ServicoAccounting
 * publicaria no broker real (CreditReserved, CreditRejected) e
 * permite inspecioná-los via GET /events — usado tanto pelos testes
 * de integração quanto pelo script de demonstração entre serviços
 * (scripts/demo-order-accounting-flow.sh).
 */
export class InMemoryEventBus implements EventPublisher {
  private readonly published: DomainEvent[] = [];

  async publish(event: DomainEvent): Promise<void> {
    this.published.push(event);
  }

  getPublishedEvents(): DomainEvent[] {
    return [...this.published];
  }

  clear(): void {
    this.published.length = 0;
  }
}
