package br.com.ftgo.order.domain.event;

import java.time.Instant;
import java.util.List;

import br.com.ftgo.order.domain.DeliveryAddress;
import br.com.ftgo.order.domain.OrderItem;

/**
 * Eventos publicados pelo ServicoOrder, conforme a coluna "Eventos
 * publicados" da especificação do serviço (EC-M4.3):
 * OrderCreated, OrderApproved, OrderCancelled, OrderDelivered.
 *
 * Cada evento é um record imutável que implementa {@link DomainEvent}.
 * Agrupados nesta classe utilitária apenas por conveniência de leitura.
 */
public final class OrderEvents {

    private OrderEvents() {
    }

    public record OrderCreated(
            String aggregateId,
            Instant occurredAt,
            String consumerId,
            String restaurantId,
            List<OrderItem> items,
            DeliveryAddress deliveryAddress,
            long totalCents
    ) implements DomainEvent {
        public OrderCreated(String orderId, String consumerId, String restaurantId,
                            List<OrderItem> items, DeliveryAddress deliveryAddress, long totalCents) {
            this(orderId, Instant.now(), consumerId, restaurantId, items, deliveryAddress, totalCents);
        }

        @Override
        public String type() {
            return "OrderCreated";
        }
    }

    public record OrderApproved(
            String aggregateId,
            Instant occurredAt,
            long reservedAmountCents
    ) implements DomainEvent {
        public OrderApproved(String orderId, long reservedAmountCents) {
            this(orderId, Instant.now(), reservedAmountCents);
        }

        @Override
        public String type() {
            return "OrderApproved";
        }
    }

    public record OrderCancelled(
            String aggregateId,
            Instant occurredAt,
            String reason
    ) implements DomainEvent {
        public OrderCancelled(String orderId, String reason) {
            this(orderId, Instant.now(), reason);
        }

        @Override
        public String type() {
            return "OrderCancelled";
        }
    }

    public record OrderDelivered(
            String aggregateId,
            Instant occurredAt,
            String courierId,
            Instant deliveredAt
    ) implements DomainEvent {
        public OrderDelivered(String orderId, String courierId, Instant deliveredAt) {
            this(orderId, Instant.now(), courierId, deliveredAt);
        }

        @Override
        public String type() {
            return "OrderDelivered";
        }
    }
}
