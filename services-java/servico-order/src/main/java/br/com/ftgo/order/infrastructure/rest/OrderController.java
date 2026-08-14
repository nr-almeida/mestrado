package br.com.ftgo.order.infrastructure.rest;

import java.net.URI;
import java.util.List;
import java.util.Set;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import br.com.ftgo.order.application.OrderService;
import br.com.ftgo.order.domain.Order;
import br.com.ftgo.order.infrastructure.messaging.InMemoryEventPublisher;
import br.com.ftgo.order.infrastructure.rest.OrderDtos.CancelRequest;
import br.com.ftgo.order.infrastructure.rest.OrderDtos.CreateOrderRequest;
import br.com.ftgo.order.infrastructure.rest.OrderDtos.ExternalEventRequest;
import br.com.ftgo.order.infrastructure.rest.OrderDtos.OrderResponse;

import jakarta.validation.Valid;

/**
 * API REST do ServicoOrder.
 *
 * <p>Rotas da especificação (EC-M4.3): {@code POST /orders} e
 * {@code GET /orders/{id}}. As demais rotas são utilitárias — listagem
 * e cancelamento direto (extensões) e um endpoint de simulação de
 * eventos externos ({@code POST /orders/{id}/events}) que substitui o
 * consumidor Kafka enquanto ServicoAccounting, ServicoKitchen e
 * ServicoDelivery não existem como serviços independentes.</p>
 */
@RestController
@RequestMapping
public class OrderController {

    /**
     * Eventos externos que o ServicoOrder sabe consumir, conforme a
     * coluna "Eventos consumidos" da EC-M4.3 (mais DeliveryCompleted —
     * ver nota de implementação em {@link Order}).
     */
    private static final Set<String> SUPPORTED_EXTERNAL_EVENTS = Set.of(
            "CreditReserved", "CreditRejected", "TicketPrepared", "DeliveryScheduled", "DeliveryCompleted");

    private final OrderService orderService;
    private final InMemoryEventPublisher eventPublisher;

    public OrderController(OrderService orderService, InMemoryEventPublisher eventPublisher) {
        this.orderService = orderService;
        this.eventPublisher = eventPublisher;
    }

    @PostMapping("/orders")
    public ResponseEntity<OrderResponse> create(@Valid @RequestBody CreateOrderRequest request) {
        Order order = orderService.createOrder(
                request.consumerId(), request.restaurantId(),
                request.toDomainItems(), request.deliveryAddress().toDomain());
        return ResponseEntity
                .created(URI.create("/orders/" + order.getId()))
                .body(OrderResponse.from(order));
    }

    @GetMapping("/orders/{id}")
    public OrderResponse getById(@PathVariable String id) {
        return OrderResponse.from(orderService.getOrder(id));
    }

    @GetMapping("/orders")
    public List<OrderResponse> list() {
        return orderService.listOrders().stream().map(OrderResponse::from).toList();
    }

    @PostMapping("/orders/{id}/cancel")
    public OrderResponse cancel(@PathVariable String id, @RequestBody(required = false) CancelRequest request) {
        String reason = (request != null && request.reason() != null)
                ? request.reason() : "Cancelado pelo consumidor.";
        return OrderResponse.from(orderService.cancelOrder(id, reason));
    }

    /**
     * Simula a chegada de um evento de domínio externo (CreditReserved,
     * CreditRejected, TicketPrepared, DeliveryScheduled,
     * DeliveryCompleted), no lugar de um consumidor Kafka real.
     */
    @PostMapping("/orders/{id}/events")
    public ResponseEntity<OrderResponse> handleExternalEvent(
            @PathVariable String id, @RequestBody ExternalEventRequest request) {

        String type = request.type();
        if (type == null || !SUPPORTED_EXTERNAL_EVENTS.contains(type)) {
            throw new IllegalArgumentException(
                    "Tipo de evento não suportado: \"" + type + "\". Suportados: " + SUPPORTED_EXTERNAL_EVENTS);
        }
        var payload = request.payload();

        Order order = switch (type) {
            case "CreditReserved" -> orderService.handleCreditReserved(
                    id, payload != null && payload.reservedAmountCents() != null ? payload.reservedAmountCents() : 0L);
            case "CreditRejected" -> orderService.handleCreditRejected(
                    id, payload != null && payload.reason() != null ? payload.reason() : "Crédito recusado.");
            case "TicketPrepared" -> orderService.handleTicketPrepared(id);
            case "DeliveryScheduled" -> orderService.handleDeliveryScheduled(
                    id, payload != null && payload.courierId() != null ? payload.courierId() : "entregador-desconhecido");
            case "DeliveryCompleted" -> orderService.handleDeliveryCompleted(id);
            default -> throw new IllegalStateException("unreachable");
        };
        return ResponseEntity.accepted().body(OrderResponse.from(order));
    }

    @GetMapping("/events")
    public List<?> publishedEvents() {
        return eventPublisher.getPublishedEvents();
    }
}
