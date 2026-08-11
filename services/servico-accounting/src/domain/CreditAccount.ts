import { AuthorizationStatus } from './AuthorizationStatus';
import { DomainEvent } from './events/DomainEvent';
import {
  CreditRejected,
  CreditRejectedPayload,
  CreditReserved,
  CreditReservedPayload,
} from './events/AccountingEvents';

export class DuplicateOrderProcessingError extends Error {
  constructor(orderId: string) {
    super(`O pedido "${orderId}" já foi processado por este ServicoAccounting.`);
    this.name = 'DuplicateOrderProcessingError';
  }
}

interface CreditAuthorization {
  orderId: string;
  amountCents: number;
  status: AuthorizationStatus;
  reason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreditAccountState {
  consumerId: string;
  creditLimitCents: number;
  authorizations: CreditAuthorization[];
}

/**
 * CreditAccount — agregado do bounded context Accounting (EC-M2.1:
 * subdomínio de suporte responsável pela autorização de crédito e
 * pelo registro financeiro dos pedidos). Corresponde ao
 * `ServicoAccounting` da EC-M4.3.
 *
 * O limite de consistência transacional do agregado é a conta de
 * crédito de **um consumidor**: toda reserva e liberação de crédito
 * para os pedidos desse consumidor passa por aqui, garantindo que a
 * soma dos valores reservados nunca ultrapasse o limite de crédito
 * disponível — a mesma invariante que, no FTGO original, evita
 * autorizar um pedido sem saldo (EC-M6.1: "recusas legítimas, como
 * aquelas ocasionadas pela ausência de limite no cartão").
 *
 * Reage ao evento externo `OrderCreated` (publicado pelo
 * ServicoOrder) reservando crédito e publicando `CreditReserved` ou
 * `CreditRejected` — exatamente os dois eventos listados na
 * especificação do ServicoAccounting (EC-M4.3). Reage também a
 * `OrderCancelled`, liberando uma reserva ainda ativa como ação
 * compensatória do padrão Saga coreografada (EC-M4.4); essa liberação
 * não publica um novo evento, pois a tabela de especificação não lista
 * nenhum evento adicional para esse caso.
 */
export class CreditAccount {
  readonly consumerId: string;
  private _creditLimitCents: number;
  private readonly authorizations: Map<string, CreditAuthorization>;

  private constructor(
    consumerId: string,
    creditLimitCents: number,
    authorizations: Map<string, CreditAuthorization>
  ) {
    this.consumerId = consumerId;
    this._creditLimitCents = creditLimitCents;
    this.authorizations = authorizations;
  }

  get creditLimitCents(): number {
    return this._creditLimitCents;
  }

  /** Utilitário de configuração/teste — ajusta o limite de crédito do consumidor. */
  changeCreditLimit(newLimitCents: number): void {
    if (newLimitCents < 0) {
      throw new Error('O limite de crédito não pode ser negativo.');
    }
    this._creditLimitCents = newLimitCents;
  }

  static create(consumerId: string, creditLimitCents: number): CreditAccount {
    if (creditLimitCents < 0) {
      throw new Error('O limite de crédito não pode ser negativo.');
    }
    return new CreditAccount(consumerId, creditLimitCents, new Map());
  }

  static restore(state: CreditAccountState): CreditAccount {
    const map = new Map(state.authorizations.map((a) => [a.orderId, a]));
    return new CreditAccount(state.consumerId, state.creditLimitCents, map);
  }

  /** Soma dos valores atualmente reservados (autorizações em status RESERVED). */
  get reservedCents(): number {
    let total = 0;
    for (const auth of this.authorizations.values()) {
      if (auth.status === AuthorizationStatus.RESERVED) {
        total += auth.amountCents;
      }
    }
    return total;
  }

  get availableCents(): number {
    return this.creditLimitCents - this.reservedCents;
  }

  getAuthorization(orderId: string): CreditAuthorization | undefined {
    return this.authorizations.get(orderId);
  }

  /**
   * Reage ao evento OrderCreated: tenta reservar `amountCents` de
   * crédito para o pedido `orderId`. Produz CreditReserved (se houver
   * limite disponível) ou CreditRejected (caso contrário).
   *
   * Idempotente por design de consumo de eventos: se este `orderId`
   * já foi processado, lança DuplicateOrderProcessingError em vez de
   * decidir novamente — o chamador deve tratar isso como "evento já
   * processado" e não republicar um novo evento.
   */
  reserve(orderId: string, amountCents: number): DomainEvent<CreditReservedPayload | CreditRejectedPayload> {
    if (this.authorizations.has(orderId)) {
      throw new DuplicateOrderProcessingError(orderId);
    }
    if (amountCents <= 0) {
      throw new Error('O valor a ser reservado deve ser maior que zero.');
    }

    const now = new Date().toISOString();

    if (amountCents <= this.availableCents) {
      this.authorizations.set(orderId, {
        orderId,
        amountCents,
        status: AuthorizationStatus.RESERVED,
        createdAt: now,
        updatedAt: now,
      });
      return CreditReserved(orderId, { consumerId: this.consumerId, reservedAmountCents: amountCents });
    }

    const reason = `Limite de crédito insuficiente (disponível: ${this.availableCents}, solicitado: ${amountCents}).`;
    this.authorizations.set(orderId, {
      orderId,
      amountCents,
      status: AuthorizationStatus.REJECTED,
      reason,
      createdAt: now,
      updatedAt: now,
    });
    return CreditRejected(orderId, { consumerId: this.consumerId, reason });
  }

  /**
   * Reage ao evento OrderCancelled: libera a reserva de crédito do
   * pedido, se ainda estiver ativa (ação compensatória da Saga). É
   * seguro chamar mais de uma vez ou para um pedido desconhecido —
   * comportamento idempotente esperado de um consumidor de eventos.
   */
  release(orderId: string): void {
    const auth = this.authorizations.get(orderId);
    if (!auth || auth.status !== AuthorizationStatus.RESERVED) {
      return; // nada a liberar — idempotente
    }
    auth.status = AuthorizationStatus.RELEASED;
    auth.updatedAt = new Date().toISOString();
  }

  toJSON() {
    return {
      consumerId: this.consumerId,
      creditLimitCents: this.creditLimitCents,
      reservedCents: this.reservedCents,
      availableCents: this.availableCents,
      authorizations: Array.from(this.authorizations.values()),
    };
  }
}
