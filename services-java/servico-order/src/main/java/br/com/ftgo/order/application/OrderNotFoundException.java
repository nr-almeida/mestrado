package br.com.ftgo.order.application;

public class OrderNotFoundException extends RuntimeException {

    public OrderNotFoundException(String id) {
        super("Pedido \"" + id + "\" não encontrado.");
    }
}
