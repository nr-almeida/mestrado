package br.com.ftgo.order.domain;

/**
 * Erro de domínio lançado quando uma transição de estado é solicitada
 * a partir de um estado que não a permite (ex.: aprovar um pedido já
 * cancelado). Mantém a máquina de estados consistente com o fluxo
 * descrito no caso de uso "Realizar pedido" (EC-M2.2) e no modelo BPMN
 * to-be do processo Order Management (EC-M3.3).
 */
public class InvalidOrderStateTransitionException extends RuntimeException {

    public InvalidOrderStateTransitionException(OrderStatus from, String action) {
        super("Não é possível executar \"" + action + "\" a partir do estado \"" + from + "\".");
    }
}
