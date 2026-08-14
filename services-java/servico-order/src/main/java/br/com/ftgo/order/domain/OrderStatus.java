package br.com.ftgo.order.domain;

/**
 * Estados do ciclo de vida do pedido (Order), conforme o caso de uso
 * "Realizar pedido" descrito na Macroatividade 2 (EC-M2.2) do estudo
 * de caso.
 */
public enum OrderStatus {
    AGUARDANDO_ACEITACAO,
    PREPARANDO,
    AGUARDANDO_ENTREGA,
    ENTREGUE,
    CANCELADO
}
