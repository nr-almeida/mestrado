package br.com.ftgo.order.infrastructure.rest;

import java.time.Instant;
import java.util.List;

import br.com.ftgo.order.domain.DeliveryAddress;
import br.com.ftgo.order.domain.Order;
import br.com.ftgo.order.domain.OrderItem;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

/**
 * Objetos de transporte (DTOs) da API REST do ServicoOrder. Mantidos na
 * borda (infrastructure/rest) para não vazar detalhes de HTTP/validação
 * para o domínio.
 */
public final class OrderDtos {

    private OrderDtos() {
    }

    public record ItemRequest(
            @NotNull String name,
            @Positive int quantity,
            @PositiveOrZero long unitPriceCents
    ) {
        public OrderItem toDomain() {
            return new OrderItem(name, quantity, unitPriceCents);
        }
    }

    public record AddressRequest(
            @NotNull String street,
            @NotNull String city,
            @NotNull String zip
    ) {
        public DeliveryAddress toDomain() {
            return new DeliveryAddress(street, city, zip);
        }
    }

    public record CreateOrderRequest(
            @NotNull String consumerId,
            @NotNull String restaurantId,
            @NotEmpty List<@Valid ItemRequest> items,
            @NotNull @Valid AddressRequest deliveryAddress
    ) {
        public List<OrderItem> toDomainItems() {
            return items.stream().map(ItemRequest::toDomain).toList();
        }
    }

    public record CancelRequest(String reason) {
    }

    public record ExternalEventRequest(String type, EventPayload payload) {
    }

    public record EventPayload(
            Long reservedAmountCents,
            String reason,
            String courierId
    ) {
    }

    public record OrderResponse(
            String id,
            String consumerId,
            String restaurantId,
            List<OrderItem> items,
            DeliveryAddress deliveryAddress,
            long totalCents,
            String status,
            String courierId,
            String cancelReason,
            Instant createdAt,
            Instant updatedAt,
            Instant deliveredAt
    ) {
        public static OrderResponse from(Order o) {
            return new OrderResponse(
                    o.getId(), o.getConsumerId(), o.getRestaurantId(), o.getItems(),
                    o.getDeliveryAddress(), o.getTotalCents(), o.getStatus().name(),
                    o.getCourierId(), o.getCancelReason(), o.getCreatedAt(),
                    o.getUpdatedAt(), o.getDeliveredAt());
        }
    }
}
