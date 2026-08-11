import { buildApp } from './app';
import { AccountingService } from '../../application/AccountingService';
import { InMemoryCreditAccountRepository } from '../repository/InMemoryCreditAccountRepository';
import { InMemoryEventBus } from '../events/InMemoryEventBus';

const PORT = Number(process.env.PORT ?? 3001);
const DEFAULT_CREDIT_LIMIT_CENTS = Number(process.env.ACCOUNTING_DEFAULT_CREDIT_LIMIT_CENTS ?? 10000); // R$100,00

const accountRepository = new InMemoryCreditAccountRepository();
const eventBus = new InMemoryEventBus();
const accountingService = new AccountingService(accountRepository, eventBus, DEFAULT_CREDIT_LIMIT_CENTS);

const app = buildApp({ accountingService, accountRepository, eventBus });

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[servico-accounting] ouvindo na porta ${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`[servico-accounting] health check: http://localhost:${PORT}/health`);
  // eslint-disable-next-line no-console
  console.log(`[servico-accounting] limite de crédito padrão: ${DEFAULT_CREDIT_LIMIT_CENTS} centavos`);
});
