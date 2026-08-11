/**
 * Item de um pedido. Representa uma linha do cardápio selecionada
 * pelo consumidor (ver EC-M2.2, caso de uso "Realizar pedido").
 */
export interface OrderItem {
  name: string;
  quantity: number;
  unitPriceCents: number;
}

/**
 * Endereço de entrega informado pelo consumidor.
 */
export interface DeliveryAddress {
  street: string;
  city: string;
  zip: string;
}
