import { CreditAccount } from '../../domain/CreditAccount';
import { CreditAccountRepository } from '../../application/ports/CreditAccountRepository';

export class InMemoryCreditAccountRepository implements CreditAccountRepository {
  private readonly store = new Map<string, CreditAccount>();

  async save(account: CreditAccount): Promise<void> {
    this.store.set(account.consumerId, account);
  }

  async findByConsumerId(consumerId: string): Promise<CreditAccount | null> {
    return this.store.get(consumerId) ?? null;
  }

  /**
   * Varredura linear sobre as contas em memória — aceitável na escala
   * de uma demonstração. Um adaptador Postgres real usaria um índice
   * (ex.: coluna `order_id` na tabela de autorizações) em vez de
   * percorrer todas as contas.
   */
  async findByOrderId(orderId: string): Promise<CreditAccount | null> {
    for (const account of this.store.values()) {
      if (account.getAuthorization(orderId)) {
        return account;
      }
    }
    return null;
  }

  async findAll(): Promise<CreditAccount[]> {
    return Array.from(this.store.values());
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}
