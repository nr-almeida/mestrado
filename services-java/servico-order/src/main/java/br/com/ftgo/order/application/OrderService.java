package br.com.ftgo.order.application;

import java.util.List;

import org.springframework.stereotype.Service;

import br.com.ftgo.order.application.port.EventPublisher;
import br.com.ftgo.order.application.port.OrderRepository;
import br.com.ftgo.order.domain.DeliveryAddress;
import br.com.ftgo.order.domain.Order;
import br.com.ftgo.order.domain.OrderItem;
import br.com.ftgo.order.domain.event.OrderEvents;

/**
 * Casos de uso do ServicoOrder (bounded context Order Management,
 * <em>core domain</em> do FTGO — ver EC-M2.1 e EC-M4.3).
 *
 * <p>API síncrona exposta (EC-M4.3): {@code POST /orders},
 * {@code GET /orders/{id}}. Eventos consumidos: CreditReserved,
 * CreditRejected, TicketPrepared, DeliveryScheduled (+ DeliveryCompleted,
 * extensão documentada em {@link Order}). Nesta primeira versão, esses
 * eventos chegam via um endpoint HTTP de simulação, no lugar de um
 * consumidor Kafka real, enquanto os demais microsserviços não
 * existem.</p>
 */
@Service
public class OrderService {

    private final OrderRepository repository;
    private final EventPublisher eventPublisher;

    public OrderService(OrderRepository repository, EventPublisher eventPublisher) {
        this.repository = repository;
        this.eventPublisher = eventPublisher;
    }

    public Order createOrder(String consumerId, String restaurantId,
                             List<OrderItem> items, DeliveryAddress deliveryAddress) {
        Order order = Order.create(consumerId, restaurantId, items, deliveryAddress);
        repository.save(order);
        eventPublisher.publish(order.toCreatedEvent());
        return order;
    }

    public Order getOrder(String id) {
        return repository.findById(id).orElseThrow(() -> new OrderNotFoundException(id));
    }

    public List<Order> listOrders() {
        return repository.findAll();
    }

    public Order handleCreditReserved(String orderId, long reservedAmountCents) {
        Order order = getOrder(orderId);
        OrderEvents.OrderApproved event = order.onCreditReserved(reservedAmountCents);
        repository.save(order);
        eventPublisher.publish(event);
        return order;
    }

    public Order handleCreditRejected(String orderId, String reason) {
        Order order = getOrder(orderId);
        OrderEvents.OrderCancelled event = order.onCreditRejected(reason);
        repository.save(order);
        eventPublisher.publish(event);
        return order;
    }

    public Order cancelOrder(String orderId, String reason) {
        Order order = getOrder(orderId);
        OrderEvents.OrderCancelled event = order.cancel(reason);
        repository.save(order);
        eventPublisher.publish(event);
        return order;
    }

    public Order handleTicketPrepared(String orderId) {
        Order order = getOrder(orderId);
        order.onTicketPrepared();
        repository.save(order);
        return order;
    }

    public Order handleDeliveryScheduled(String orderId, String courierId) {
        Order order = getOrder(orderId);
        order.onDeliveryScheduled(courierId);
        repository.save(order);
        return order;
    }

    public Order handleDeliveryCompleted(String orderId) {
        Order order = getOrder(orderId);
        OrderEvents.OrderDelivered event = order.onDeliveryCompleted();
        repository.save(order);
        eventPublisher.publish(event);
        return order;
    }
}
