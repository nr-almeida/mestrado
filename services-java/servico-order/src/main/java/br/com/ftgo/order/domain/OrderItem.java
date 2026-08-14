package br.com.ftgo.order.domain;

/**
 * Item de um pedido. Representa uma linha do cardápio selecionada pelo
 * consumidor (ver EC-M2.2, caso de uso "Realizar pedido").
 */
public record OrderItem(String name, int quantity, long unitPriceCents) {

    public OrderItem {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("O item deve possuir um nome.");
        }
        if (quantity <= 0) {
            throw new IllegalArgumentException("A quantidade do item deve ser maior que zero.");
        }
        if (unitPriceCents < 0) {
            throw new IllegalArgumentException("O preço unitário não pode ser negativo.");
        }
    }

    public long subtotalCents() {
        return quantity * unitPriceCents;
    }
}
