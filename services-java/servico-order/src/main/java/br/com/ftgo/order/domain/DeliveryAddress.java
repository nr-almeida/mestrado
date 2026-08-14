package br.com.ftgo.order.domain;

/**
 * Endereço de entrega informado pelo consumidor.
 */
public record DeliveryAddress(String street, String city, String zip) {

    public DeliveryAddress {
        if (street == null || street.isBlank()) {
            throw new IllegalArgumentException("O logradouro é obrigatório.");
        }
        if (city == null || city.isBlank()) {
            throw new IllegalArgumentException("A cidade é obrigatória.");
        }
        if (zip == null || zip.isBlank()) {
            throw new IllegalArgumentException("O CEP é obrigatório.");
        }
    }
}
