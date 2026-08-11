import express, { Express, Request, Response, NextFunction } from 'express';
import { OrderService, OrderNotFoundError } from '../../application/OrderService';
import { InvalidOrderStateTransitionError } from '../../domain/Order';
import { InMemoryOrderRepository } from '../repository/InMemoryOrderRepository';
import { InMemoryEventBus } from '../events/InMemoryEventBus';

/**
 * Tipos de eventos externos que o ServicoOrder sabe consumir,
 * conforme a especificação de "Eventos consumidos" da EC-M4.3
 * (mais DeliveryCompleted — ver nota de implementação em Order.ts).
 * Até que ServicoAccounting, ServicoKitchen e ServicoDelivery sejam
 * implementados como serviços independentes, esses eventos podem ser
 * simulados via POST /orders/:id/events, no lugar de um consumidor
 * Kafka real.
 */
const SUPPORTED_EXTERNAL_EVENTS = [
  'CreditReserved',
  'CreditRejected',
  'TicketPrepared',
  'DeliveryScheduled',
  'DeliveryCompleted',
] as const;

export interface AppDependencies {
  orderService: OrderService;
  orderRepository: InMemoryOrderRepository;
  eventBus: InMemoryEventBus;
}

export function buildApp(deps: AppDependencies): Express {
  const { orderService, orderRepository, eventBus } = deps;
  const app = express();
  app.use(express.json());

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'UP', service: 'servico-order' });
  });

  // POST /orders — cria um pedido (EC-M4.3: API síncrona do ServicoOrder)
  app.post('/orders', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { consumerId, restaurantId, items, deliveryAddress } = req.body ?? {};
      if (!consumerId || !restaurantId || !deliveryAddress) {
        return res.status(400).json({
          error: 'Campos obrigatórios ausentes: consumerId, restaurantId, deliveryAddress.',
        });
      }
      const order = await orderService.createOrder({
        consumerId,
        restaurantId,
        items,
        deliveryAddress,
      });
      res.status(201).location(`/orders/${order.id}`).json(order.toJSON());
    } catch (err) {
      next(err);
    }
  });

  // GET /orders — lista pedidos (utilitário de demonstração/depuração, fora da EC-M4.3)
  app.get('/orders', async (_req: Request, res: Response) => {
    const orders = await orderRepository.findAll();
    res.json(orders.map((o) => o.toJSON()));
  });

  // GET /orders/:id — consulta um pedido (EC-M4.3: API síncrona do ServicoOrder)
  app.get('/orders/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const order = await orderService.getOrder(String(req.params.id));
      res.json(order.toJSON());
    } catch (err) {
      next(err);
    }
  });

  // POST /orders/:id/cancel — cancelamento direto (extensão além da EC-M4.3)
  app.post('/orders/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reason } = req.body ?? {};
      const order = await orderService.cancelOrder(String(req.params.id), reason ?? 'Cancelado pelo consumidor.');
      res.json(order.toJSON());
    } catch (err) {
      next(err);
    }
  });

  // POST /orders/:id/events — simula a chegada de um evento de domínio
  // externo (CreditReserved, CreditRejected, TicketPrepared,
  // DeliveryScheduled, DeliveryCompleted), no lugar de um consumidor
  // Kafka real, enquanto os demais microsserviços não existem.
  app.post('/orders/:id/events', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { type, payload } = req.body ?? {};
      if (!SUPPORTED_EXTERNAL_EVENTS.includes(type)) {
        return res.status(400).json({
          error: `Tipo de evento não suportado: "${type}". Suportados: ${SUPPORTED_EXTERNAL_EVENTS.join(', ')}.`,
        });
      }

      const orderId = String(req.params.id);
      let order;
      switch (type) {
        case 'CreditReserved':
          order = await orderService.handleCreditReserved(orderId, payload?.reservedAmountCents ?? 0);
          break;
        case 'CreditRejected':
          order = await orderService.handleCreditRejected(orderId, payload?.reason ?? 'Crédito recusado.');
          break;
        case 'TicketPrepared':
          order = await orderService.handleTicketPrepared(orderId);
          break;
        case 'DeliveryScheduled':
          order = await orderService.handleDeliveryScheduled(orderId, payload?.courierId ?? 'entregador-desconhecido');
          break;
        case 'DeliveryCompleted':
          order = await orderService.handleDeliveryCompleted(orderId);
          break;
      }
      res.status(202).json(order!.toJSON());
    } catch (err) {
      next(err);
    }
  });

  // GET /events — inspeciona os eventos publicados pelo ServicoOrder
  // (OrderCreated, OrderApproved, OrderCancelled, OrderDelivered) na
  // ordem em que ocorreram. Útil para provar, em uma demonstração, que
  // os eventos corretos foram emitidos.
  app.get('/events', (_req: Request, res: Response) => {
    res.json(eventBus.getPublishedEvents());
  });

  // Tratamento de erros -> status HTTP apropriado
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof OrderNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    if (err instanceof InvalidOrderStateTransitionError) {
      return res.status(409).json({ error: err.message });
    }
    if (err instanceof Error) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Erro interno.' });
  });

  return app;
}
