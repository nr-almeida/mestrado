/**
 * Estados do ciclo de vida do pedido (Order), conforme o caso de uso
 * "Realizar pedido" descrito na Macroatividade 2 (EC-M2.2) do estudo de caso.
 */
export enum OrderStatus {
  AGUARDANDO_ACEITACAO = 'AGUARDANDO_ACEITACAO',
  PREPARANDO = 'PREPARANDO',
  AGUARDANDO_ENTREGA = 'AGUARDANDO_ENTREGA',
  ENTREGUE = 'ENTREGUE',
  CANCELADO = 'CANCELADO',
}
