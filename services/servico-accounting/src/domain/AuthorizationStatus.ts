/**
 * Estado de uma autorização de crédito associada a um pedido.
 */
export enum AuthorizationStatus {
  /** Crédito reservado com sucesso para o pedido. */
  RESERVED = 'RESERVED',
  /** Reserva recusada por falta de limite disponível. */
  REJECTED = 'REJECTED',
  /** Reserva previamente concedida e depois liberada (compensação via OrderCancelled). */
  RELEASED = 'RELEASED',
}
