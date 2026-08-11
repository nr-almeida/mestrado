import { Order, InvalidOrderStateTransitionError } from '../../src/domain/Order';
import { OrderStatus } from '../../src/domain/OrderStatus';

function makeOrderProps() {
  return {
    consumerId: 'consumer-1',
    restaurantId: 'restaurant-1',
    items: [
      { name: 'Pizza Margherita', quantity: 1, unitPriceCents: 4500 },
      { name: 'Refrigerante', quantity: 2, unitPriceCents: 700 },
    ],
    deliveryAddress: { street: 'Rua das Flores, 123', city: 'São Paulo', zip: '01000-000' },
  };
}

describe('Order (agregado — core domain do FTGO)', () => {
  it('cria um pedido no estado AGUARDANDO_ACEITACAO e publica OrderCreated', () => {
    const { order, event } = Order.create(makeOrderProps());

    expect(order.status).toBe(OrderStatus.AGUARDANDO_ACEITACAO);
    expect(order.totalCents).toBe(4500 + 2 * 700); // 5900
    expect(event.type).toBe('OrderCreated');
    expect(event.aggregateId).toBe(order.id);
    expect(event.payload.totalCents).toBe(5900);
  });

  it('rejeita a criação de um pedido sem itens', () => {
    const props = { ...makeOrderProps(), items: [] };
    expect(() => Order.create(props)).toThrow(/ao menos um item/i);
  });

  it('rejeita item com quantidade inválida', () => {
    const props = makeOrderProps();
    props.items[0].quantity = 0;
    expect(() => Order.create(props)).toThrow(/inválidos/i);
  });

  it('transiciona para PREPARANDO e publica OrderApproved ao receber CreditReserved', () => {
    const { order } = Order.create(makeOrderProps());
    const event = order.onCreditReserved(5900);

    expect(order.status).toBe(OrderStatus.PREPARANDO);
    expect(event.type).toBe('OrderApproved');
    expect(event.payload.reservedAmountCents).toBe(5900);
  });

  it('transiciona para CANCELADO e publica OrderCancelled ao receber CreditRejected', () => {
    const { order } = Order.create(makeOrderProps());
    const event = order.onCreditRejected('Limite insuficiente.');

    expect(order.status).toBe(OrderStatus.CANCELADO);
    expect(order.cancelReason).toBe('Limite insuficiente.');
    expect(event.type).toBe('OrderCancelled');
  });

  it('não permite aprovar um pedido que não está aguardando aceitação', () => {
    const { order } = Order.create(makeOrderProps());
    order.onCreditReserved(5900); // -> PREPARANDO

    expect(() => order.onCreditReserved(5900)).toThrow(InvalidOrderStateTransitionError);
  });

  it('não permite rejeitar crédito de um pedido já cancelado', () => {
    const { order } = Order.create(makeOrderProps());
    order.onCreditRejected('Falha no cartão.');

    expect(() => order.onCreditRejected('Outra falha.')).toThrow(InvalidOrderStateTransitionError);
  });

  it('percorre o fluxo completo até ENTREGUE e publica os eventos esperados, em ordem', () => {
    const { order, event: created } = Order.create(makeOrderProps());
    const approved = order.onCreditReserved(5900);
    order.onTicketPrepared();
    order.onDeliveryScheduled('entregador-42');
    const delivered = order.onDeliveryCompleted();

    expect(order.status).toBe(OrderStatus.ENTREGUE);
    expect(order.courierId).toBe('entregador-42');
    expect(order.deliveredAt).toBeDefined();

    expect([created.type, approved.type, delivered.type]).toEqual([
      'OrderCreated',
      'OrderApproved',
      'OrderDelivered',
    ]);
    expect(delivered.payload.courierId).toBe('entregador-42');
  });

  it('não permite preparar o ticket antes da aprovação de crédito', () => {
    const { order } = Order.create(makeOrderProps());
    expect(() => order.onTicketPrepared()).toThrow(InvalidOrderStateTransitionError);
  });

  it('não permite concluir a entrega sem entregador atribuído', () => {
    const { order } = Order.create(makeOrderProps());
    order.onCreditReserved(5900);
    order.onTicketPrepared();

    expect(() => order.onDeliveryCompleted()).toThrow(/entregador atribuído/i);
  });

  it('permite cancelamento direto antes da entrega, mas não depois', () => {
    const { order } = Order.create(makeOrderProps());
    order.onCreditReserved(5900);
    order.onTicketPrepared();
    order.onDeliveryScheduled('entregador-7');
    order.onDeliveryCompleted();

    expect(() => order.cancel('Consumidor desistiu.')).toThrow(InvalidOrderStateTransitionError);
  });

  it('serializa o pedido via toJSON com os campos esperados', () => {
    const { order } = Order.create(makeOrderProps());
    const json = order.toJSON();

    expect(json).toMatchObject({
      id: order.id,
      status: OrderStatus.AGUARDANDO_ACEITACAO,
      totalCents: 5900,
    });
  });
});
