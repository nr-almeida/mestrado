import express, { Express, Request, Response, NextFunction } from 'express';
import { AccountingService } from '../../application/AccountingService';
import { CreditAccountNotFoundError } from '../../application/errors';
import { InMemoryCreditAccountRepository } from '../repository/InMemoryCreditAccountRepository';
import { InMemoryEventBus } from '../events/InMemoryEventBus';

/**
 * Eventos que o ServicoAccounting sabe consumir, conforme a
 * especificação de "Eventos consumidos" da EC-M4.3: OrderCreated e
 * OrderCancelled. Até que exista um broker real (Kafka, EC-M5.2),
 * esses eventos chegam via POST /events — o mesmo formato de envelope
 * ({type, aggregateId, payload}) publicado pelo GET /events do
 * ServicoOrder, para permitir repassar um evento de um serviço para o
 * outro sem transformação (ver scripts/demo-order-accounting-flow.sh).
 */
const SUPPORTED_EXTERNAL_EVENTS = ['OrderCreated', 'OrderCancelled'] as const;

export interface AppDependencies {
  accountingService: AccountingService;
  accountRepository: InMemoryCreditAccountRepository;
  eventBus: InMemoryEventBus;
}

export function buildApp(deps: AppDependencies): Express {
  const { accountingService, accountRepository, eventBus } = deps;
  const app = express();
  app.use(express.json());

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'UP', service: 'servico-accounting' });
  });

  // POST /credit-accounts — utilitário de configuração/teste (fora da
  // EC-M4.3, que não define API síncrona para o ServicoAccounting).
  // Permite criar/ajustar o limite de crédito de um consumidor para
  // demonstrar tanto o caminho de aprovação quanto o de recusa.
  app.post('/credit-accounts', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { consumerId, creditLimitCents } = req.body ?? {};
      if (!consumerId || typeof creditLimitCents !== 'number') {
        return res.status(400).json({ error: 'Campos obrigatórios: consumerId, creditLimitCents (number).' });
      }
      const account = await accountingService.setCreditLimit(consumerId, creditLimitCents);
      res.status(201).json(account.toJSON());
    } catch (err) {
      next(err);
    }
  });

  // GET /credit-accounts/:consumerId — utilitário de inspeção/depuração
  app.get('/credit-accounts/:consumerId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const account = await accountingService.getAccount(String(req.params.consumerId));
      res.json(account.toJSON());
    } catch (err) {
      next(err);
    }
  });

  // GET /credit-accounts — lista todas as contas (utilitário de demonstração)
  app.get('/credit-accounts', async (_req: Request, res: Response) => {
    const accounts = await accountRepository.findAll();
    res.json(accounts.map((a) => a.toJSON()));
  });

  // POST /events — simula a chegada de OrderCreated ou OrderCancelled
  // (publicados pelo ServicoOrder), no lugar de um consumidor Kafka real.
  app.post('/events', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { type, aggregateId, payload } = req.body ?? {};
      if (!SUPPORTED_EXTERNAL_EVENTS.includes(type)) {
        return res.status(400).json({
          error: `Tipo de evento não suportado: "${type}". Suportados: ${SUPPORTED_EXTERNAL_EVENTS.join(', ')}.`,
        });
      }
      if (!aggregateId) {
        return res.status(400).json({ error: 'Campo obrigatório ausente: aggregateId (orderId).' });
      }

      if (type === 'OrderCreated') {
        const { consumerId, totalCents } = payload ?? {};
        if (!consumerId || typeof totalCents !== 'number') {
          return res.status(400).json({
            error: 'Payload de OrderCreated deve conter consumerId e totalCents (number).',
          });
        }
        const { account, alreadyProcessed } = await accountingService.handleOrderCreated(
          aggregateId,
          consumerId,
          totalCents
        );
        return res.status(202).json({ alreadyProcessed, account: account.toJSON() });
      }

      // OrderCancelled
      const account = await accountingService.handleOrderCancelled(aggregateId);
      return res.status(202).json({ account: account ? account.toJSON() : null });
    } catch (err) {
      next(err);
    }
  });

  // GET /events — inspeciona os eventos publicados (CreditReserved/CreditRejected)
  app.get('/events', (_req: Request, res: Response) => {
    res.json(eventBus.getPublishedEvents());
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof CreditAccountNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    if (err instanceof Error) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Erro interno.' });
  });

  return app;
}
