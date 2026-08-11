import { DomainEvent, createEvent } from './DomainEvent';

/**
 * Nota sobre `aggregateId`: por convenção de integração entre os
 * bounded contexts, os eventos abaixo usam como `aggregateId` o
 * identificador do **pedido** (orderId) — não o identificador interno
 * da conta de crédito (`CreditAccount`, chaveada por `consumerId`).
 * Isso mantém o `aggregateId` como a chave de correlação que o
 * consumidor (ServicoOrder) espera, mesmo sendo publicado por outro
 * bounded context. É o mesmo `orderId` recebido no evento
 * `OrderCreated` que originou esta decisão de crédito.
 */

export interface CreditReservedPayload {
  consumerId: string;
  reservedAmountCents: number;
}
export const CreditReserved = (
  orderId: string,
  payload: CreditReservedPayload
): DomainEvent<CreditReservedPayload> => createEvent('CreditReserved', orderId, payload);

export interface CreditRejectedPayload {
  consumerId: string;
  reason: string;
}
export const CreditRejected = (
  orderId: string,
  payload: CreditRejectedPayload
): DomainEvent<CreditRejectedPayload> => createEvent('CreditRejected', orderId, payload);
