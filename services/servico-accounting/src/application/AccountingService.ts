import { CreditAccount, DuplicateOrderProcessingError } from '../domain/CreditAccount';
import { CreditAccountRepository } from './ports/CreditAccountRepository';
import { EventPublisher } from './ports/EventPublisher';
import { CreditAccountNotFoundError } from './errors';

/**
 * Casos de uso do ServicoAccounting (bounded context Accounting,
 * subdomínio de suporte — ver EC-M2.1 e EC-M4.3).
 *
 * Este serviço não expõe API síncrona própria (a tabela de
 * especificação da EC-M4.3 marca "---" para o ServicoAccounting):
 * ele reage exclusivamente aos eventos `OrderCreated` e
 * `OrderCancelled`, publicados pelo ServicoOrder. Nesta primeira
 * versão, esses eventos chegam via um endpoint HTTP de simulação
 * (POST /events), no lugar de um consumidor Kafka real — ver
 * scripts/demo-order-accounting-flow.sh na raiz do monorepo para uma
 * demonstração dos dois serviços conversando de ponta a ponta.
 */
export class AccountingService {
  constructor(
    private readonly repository: CreditAccountRepository,
    private readonly eventPublisher: EventPublisher,
    private readonly defaultCreditLimitCents: number
  ) {}

  /** Utilitário de configuração/teste — cria ou atualiza o limite de crédito de um consumidor. */
  async setCreditLimit(consumerId: string, creditLimitCents: number): Promise<CreditAccount> {
    const existing = await this.repository.findByConsumerId(consumerId);
    const account = existing ?? CreditAccount.create(consumerId, creditLimitCents);
    if (existing) {
      account.changeCreditLimit(creditLimitCents);
    }
    await this.repository.save(account);
    return account;
  }

  async getAccount(consumerId: string): Promise<CreditAccount> {
    const account = await this.repository.findByConsumerId(consumerId);
    if (!account) {
      throw new CreditAccountNotFoundError(consumerId);
    }
    return account;
  }

  /**
   * Reage ao evento OrderCreated. Cria a conta de crédito do
   * consumidor sob demanda (com o limite padrão do serviço) caso
   * ainda não exista uma. Idempotente: se o pedido já foi processado
   * anteriormente, não decide novamente nem republica o evento.
   */
  async handleOrderCreated(
    orderId: string,
    consumerId: string,
    amountCents: number
  ): Promise<{ account: CreditAccount; alreadyProcessed: boolean }> {
    let account = await this.repository.findByConsumerId(consumerId);
    if (!account) {
      account = CreditAccount.create(consumerId, this.defaultCreditLimitCents);
    }

    try {
      const event = account.reserve(orderId, amountCents);
      await this.repository.save(account);
      await this.eventPublisher.publish(event);
      return { account, alreadyProcessed: false };
    } catch (err) {
      if (err instanceof DuplicateOrderProcessingError) {
        return { account, alreadyProcessed: true };
      }
      throw err;
    }
  }

  /**
   * Reage ao evento OrderCancelled, liberando uma reserva ainda ativa
   * (ação compensatória). Localiza a conta a partir do próprio
   * `orderId` (ver nota em CreditAccountRepository.findByOrderId).
   * Idempotente e silenciosa quando não há conta ou reserva
   * correspondente — ver CreditAccount.release().
   */
  async handleOrderCancelled(orderId: string): Promise<CreditAccount | null> {
    const account = await this.repository.findByOrderId(orderId);
    if (!account) {
      return null;
    }
    account.release(orderId);
    await this.repository.save(account);
    return account;
  }
}
