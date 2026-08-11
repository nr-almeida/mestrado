import { CreditAccount } from '../../domain/CreditAccount';

/**
 * Porta de saída para persistência do agregado CreditAccount. A
 * EC-M4.3 especifica `accounting_db` (PostgreSQL) como banco de dados
 * privado do ServicoAccounting — nesta primeira versão, um adaptador
 * em memória cumpre esse papel (ver InMemoryCreditAccountRepository).
 */
export interface CreditAccountRepository {
  save(account: CreditAccount): Promise<void>;
  findByConsumerId(consumerId: string): Promise<CreditAccount | null>;

  /**
   * Localiza a conta de crédito que contém uma autorização para o
   * pedido informado. Necessário porque o evento `OrderCancelled`
   * publicado pelo ServicoOrder carrega apenas o `orderId` (via
   * `aggregateId`) e a razão do cancelamento — não o `consumerId` —
   * então a liberação da reserva de crédito (ação compensatória)
   * precisa localizar a conta a partir do próprio pedido.
   */
  findByOrderId(orderId: string): Promise<CreditAccount | null>;
}
