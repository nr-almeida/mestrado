import request from 'supertest';
import { Express } from 'express';
import { buildApp } from '../../src/infrastructure/http/app';
import { OrderService } from '../../src/application/OrderService';
import { InMemoryOrderRepository } from '../../src/infrastructure/repository/InMemoryOrderRepository';
import { InMemoryEventBus } from '../../src/infrastructure/events/InMemoryEventBus';

function makeValidOrderPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    consumerId: 'consumer-1',
    restaurantId: 'restaurant-1',
    items: [{ name: 'Pizza Margherita', quantity: 1, unitPriceCents: 4500 }],
    deliveryAddress: { street: 'Rua das Flores, 123', city: 'São Paulo', zip: '01000-000' },
    ...overrides,
  };
}

describe('API HTTP do ServicoOrder', () => {
  let app: Express;
  let eventBus: InMemoryEventBus;

  beforeEach(() => {
    const orderRepository = new InMemoryOrderRepository();
    eventBus = new InMemoryEventBus();
    const orderService = new OrderService(orderRepository, eventBus);
    app = buildApp({ orderService, orderRepository, eventBus });
  });

  it('GET /health responde 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'UP', service: 'servico-order' });
  });

  it('POST /orders cria um pedido e retorna 201 com Location', async () => {
    const res = await request(app).post('/orders').send(makeValidOrderPayload());

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('AGUARDANDO_ACEITACAO');
    expect(res.body.totalCents).toBe(4500);
    expect(res.headers.location).toBe(`/orders/${res.body.id}`);
  });

  it('POST /orders rejeita payload sem campos obrigatórios (400)', async () => {
    const res = await request(app).post('/orders').send({ items: [] });
    expect(res.status).toBe(400);
  });

  it('GET /orders/:id retorna 404 para pedido inexistente', async () => {
    const res = await request(app).get('/orders/nao-existe');
    expect(res.status).toBe(404);
  });

  it('GET /orders/:id retorna o pedido criado', async () => {
    const created = await request(app).post('/orders').send(makeValidOrderPayload());
    const res = await request(app).get(`/orders/${created.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
  });

  it('percorre o ciclo de vida completo via eventos simulados e chega a ENTREGUE', async () => {
    const created = await request(app).post('/orders').send(makeValidOrderPayload());
    const orderId = created.body.id;

    const creditReserved = await request(app)
      .post(`/orders/${orderId}/events`)
      .send({ type: 'CreditReserved', payload: { reservedAmountCents: 4500 } });
    expect(creditReserved.status).toBe(202);
    expect(creditReserved.body.status).toBe('PREPARANDO');

    const ticketPrepared = await request(app)
      .post(`/orders/${orderId}/events`)
      .send({ type: 'TicketPrepared' });
    expect(ticketPrepared.status).toBe(202);
    expect(ticketPrepared.body.status).toBe('AGUARDANDO_ENTREGA');

    const deliveryScheduled = await request(app)
      .post(`/orders/${orderId}/events`)
      .send({ type: 'DeliveryScheduled', payload: { courierId: 'entregador-42' } });
    expect(deliveryScheduled.status).toBe(202);
    expect(deliveryScheduled.body.courierId).toBe('entregador-42');

    const deliveryCompleted = await request(app)
      .post(`/orders/${orderId}/events`)
      .send({ type: 'DeliveryCompleted' });
    expect(deliveryCompleted.status).toBe(202);
    expect(deliveryCompleted.body.status).toBe('ENTREGUE');

    // GET /events comprova que os eventos publicados seguem a ordem
    // OrderCreated -> OrderApproved -> OrderDelivered (EC-M4.3).
    const events = await request(app).get('/events');
    expect(events.status).toBe(200);
    const types = events.body.map((e: { type: string }) => e.type);
    expect(types).toEqual(['OrderCreated', 'OrderApproved', 'OrderDelivered']);
  });

  it('cancela o pedido quando o crédito é recusado (CreditRejected)', async () => {
    const created = await request(app).post('/orders').send(makeValidOrderPayload());
    const orderId = created.body.id;

    const res = await request(app)
      .post(`/orders/${orderId}/events`)
      .send({ type: 'CreditRejected', payload: { reason: 'Limite insuficiente.' } });

    expect(res.status).toBe(202);
    expect(res.body.status).toBe('CANCELADO');
    expect(res.body.cancelReason).toBe('Limite insuficiente.');

    const types = eventBus.getPublishedEvents().map((e) => e.type);
    expect(types).toEqual(['OrderCreated', 'OrderCancelled']);
  });

  it('retorna 409 ao tentar aplicar um evento incompatível com o estado atual', async () => {
    const created = await request(app).post('/orders').send(makeValidOrderPayload());
    const orderId = created.body.id;

    // TicketPrepared antes de CreditReserved é uma transição inválida.
    const res = await request(app)
      .post(`/orders/${orderId}/events`)
      .send({ type: 'TicketPrepared' });

    expect(res.status).toBe(409);
  });

  it('retorna 400 para tipo de evento não suportado', async () => {
    const created = await request(app).post('/orders').send(makeValidOrderPayload());
    const res = await request(app)
      .post(`/orders/${created.body.id}/events`)
      .send({ type: 'EventoInexistente' });

    expect(res.status).toBe(400);
  });

  it('POST /orders/:id/cancel cancela um pedido ainda não entregue', async () => {
    const created = await request(app).post('/orders').send(makeValidOrderPayload());
    const res = await request(app)
      .post(`/orders/${created.body.id}/cancel`)
      .send({ reason: 'Consumidor desistiu.' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELADO');
  });

  it('GET /orders lista todos os pedidos criados', async () => {
    await request(app).post('/orders').send(makeValidOrderPayload());
    await request(app).post('/orders').send(makeValidOrderPayload({ consumerId: 'consumer-2' }));

    const res = await request(app).get('/orders');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});
