import { Order, CreateOrderProps } from '../domain/Order';
import { OrderRepository } from './ports/OrderRepository';
import { EventPublisher } from './ports/EventPublisher';

export class OrderNotFoundError extends Error {
  constructor(id: string) {
    super(`Pedido "${id}" não encontrado.`);
    this.name = 'OrderNotFoundError';
  }
}

/**
 * Casos de uso do ServicoOrder (bounded context Order Management,
 * *core domain* do FTGO — ver EC-M2.1 e EC-M4.3).
 *
 * API síncrona exposta (EC-M4.3): POST /orders, GET /orders/{id}.
 * Eventos consumidos: CreditReserved, CreditRejected, TicketPrepared,
 * DeliveryScheduled (+ DeliveryCompleted, extensão documentada em
 * Order.ts). Nesta primeira versão, esses eventos chegam via um
 * EventBus em memória, simulando os demais microsserviços até que
 * sejam implementados.
 */
export class OrderService {
  constructor(
    private readonly repository: OrderRepository,
    private readonly eventPublisher: EventPublisher
  ) {}

  async createOrder(props: CreateOrderProps): Promise<Order> {
    const { order, event } = Order.create(props);
    await this.repository.save(order);
    await this.eventPublisher.publish(event);
    return order;
  }

  async getOrder(id: string): Promise<Order> {
    const order = await this.repository.findById(id);
    if (!order) {
      throw new OrderNotFoundError(id);
    }
    return order;
  }

  async handleCreditReserved(orderId: string, reservedAmountCents: number): Promise<Order> {
    const order = await this.getOrder(orderId);
    const event = order.onCreditReserved(reservedAmountCents);
    await this.repository.save(order);
    await this.eventPublisher.publish(event);
    return order;
  }

  async handleCreditRejected(orderId: string, reason: string): Promise<Order> {
    const order = await this.getOrder(orderId);
    const event = order.onCreditRejected(reason);
    await this.repository.save(order);
    await this.eventPublisher.publish(event);
    return order;
  }

  async cancelOrder(orderId: string, reason: string): Promise<Order> {
    const order = await this.getOrder(orderId);
    const event = order.cancel(reason);
    await this.repository.save(order);
    await this.eventPublisher.publish(event);
    return order;
  }

  async handleTicketPrepared(orderId: string): Promise<Order> {
    const order = await this.getOrder(orderId);
    order.onTicketPrepared();
    await this.repository.save(order);
    return order;
  }

  async handleDeliveryScheduled(orderId: string, courierId: string): Promise<Order> {
    const order = await this.getOrder(orderId);
    order.onDeliveryScheduled(courierId);
    await this.repository.save(order);
    return order;
  }

  async handleDeliveryCompleted(orderId: string): Promise<Order> {
    const order = await this.getOrder(orderId);
    const event = order.onDeliveryCompleted();
    await this.repository.save(order);
    await this.eventPublisher.publish(event);
    return order;
  }
}
