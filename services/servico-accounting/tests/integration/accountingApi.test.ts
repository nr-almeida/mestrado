import request from 'supertest';
import { Express } from 'express';
import { buildApp } from '../../src/infrastructure/http/app';
import { AccountingService } from '../../src/application/AccountingService';
import { InMemoryCreditAccountRepository } from '../../src/infrastructure/repository/InMemoryCreditAccountRepository';
import { InMemoryEventBus } from '../../src/infrastructure/events/InMemoryEventBus';

const DEFAULT_LIMIT = 10000; // R$ 100,00

describe('API HTTP do ServicoAccounting', () => {
  let app: Express;
  let eventBus: InMemoryEventBus;

  beforeEach(() => {
    const accountRepository = new InMemoryCreditAccountRepository();
    eventBus = new InMemoryEventBus();
    const accountingService = new AccountingService(accountRepository, eventBus, DEFAULT_LIMIT);
    app = buildApp({ accountingService, accountRepository, eventBus });
  });

  it('GET /health responde 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'UP', service: 'servico-accounting' });
  });

  it('POST /credit-accounts cria uma conta com o limite informado', async () => {
    const res = await request(app)
      .post('/credit-accounts')
      .send({ consumerId: 'consumer-1', creditLimitCents: 50000 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ consumerId: 'consumer-1', creditLimitCents: 50000, availableCents: 50000 });
  });

  it('GET /credit-accounts/:consumerId retorna 404 para conta inexistente', async () => {
    const res = await request(app).get('/credit-accounts/nao-existe');
    expect(res.status).toBe(404);
  });

  it('processa OrderCreated com conta pré-existente e reserva o crédito', async () => {
    await request(app).post('/credit-accounts').send({ consumerId: 'consumer-1', creditLimitCents: 50000 });

    const res = await request(app)
      .post('/events')
      .send({
        type: 'OrderCreated',
        aggregateId: 'order-1',
        payload: { consumerId: 'consumer-1', totalCents: 4500 },
      });

    expect(res.status).toBe(202);
    expect(res.body.alreadyProcessed).toBe(false);
    expect(res.body.account.reservedCents).toBe(4500);

    const events = await request(app).get('/events');
    expect(events.body).toHaveLength(1);
    expect(events.body[0]).toMatchObject({ type: 'CreditReserved', aggregateId: 'order-1' });
  });

  it('cria a conta automaticamente com o limite padrão quando OrderCreated chega para consumidor desconhecido', async () => {
    const res = await request(app)
      .post('/events')
      .send({
        type: 'OrderCreated',
        aggregateId: 'order-1',
        payload: { consumerId: 'consumer-novo', totalCents: 2000 },
      });

    expect(res.status).toBe(202);
    expect(res.body.account.creditLimitCents).toBe(DEFAULT_LIMIT);
    expect(res.body.account.reservedCents).toBe(2000);
  });

  it('publica CreditRejected quando o valor do pedido excede o limite padrão', async () => {
    const res = await request(app)
      .post('/events')
      .send({
        type: 'OrderCreated',
        aggregateId: 'order-1',
        payload: { consumerId: 'consumer-pobre', totalCents: DEFAULT_LIMIT + 1 },
      });

    expect(res.status).toBe(202);
    expect(res.body.account.reservedCents).toBe(0);

    const events = await request(app).get('/events');
    expect(events.body[0].type).toBe('CreditRejected');
  });

  it('é idempotente ao receber o mesmo OrderCreated duas vezes (não publica evento duplicado)', async () => {
    const body = {
      type: 'OrderCreated',
      aggregateId: 'order-1',
      payload: { consumerId: 'consumer-1', totalCents: 1000 },
    };

    const first = await request(app).post('/events').send(body);
    expect(first.body.alreadyProcessed).toBe(false);

    const second = await request(app).post('/events').send(body);
    expect(second.body.alreadyProcessed).toBe(true);

    const events = await request(app).get('/events');
    expect(events.body).toHaveLength(1); // só um CreditReserved, não dois
  });

  it('libera a reserva ao receber OrderCancelled (sem publicar novo evento)', async () => {
    await request(app)
      .post('/events')
      .send({
        type: 'OrderCreated',
        aggregateId: 'order-1',
        payload: { consumerId: 'consumer-1', totalCents: 3000 },
      });

    const res = await request(app)
      .post('/events')
      .send({ type: 'OrderCancelled', aggregateId: 'order-1', payload: { reason: 'Cancelado.' } });

    expect(res.status).toBe(202);
    expect(res.body.account.reservedCents).toBe(0);

    const events = await request(app).get('/events');
    expect(events.body).toHaveLength(1); // apenas o CreditReserved original
  });

  it('OrderCancelled para pedido desconhecido é idempotente e não falha', async () => {
    const res = await request(app)
      .post('/events')
      .send({ type: 'OrderCancelled', aggregateId: 'pedido-nunca-visto', payload: { reason: 'x' } });

    expect(res.status).toBe(202);
    expect(res.body.account).toBeNull();
  });

  it('retorna 400 para tipo de evento não suportado', async () => {
    const res = await request(app).post('/events').send({ type: 'EventoInexistente', aggregateId: 'x' });
    expect(res.status).toBe(400);
  });

  it('retorna 400 quando o payload de OrderCreated está incompleto', async () => {
    const res = await request(app)
      .post('/events')
      .send({ type: 'OrderCreated', aggregateId: 'order-1', payload: { consumerId: 'consumer-1' } });
    expect(res.status).toBe(400);
  });
});
