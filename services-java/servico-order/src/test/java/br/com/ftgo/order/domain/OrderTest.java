package br.com.ftgo.order.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import br.com.ftgo.order.domain.event.OrderEvents;

class OrderTest {

    private static Order newOrder() {
        return Order.create(
                "consumer-1", "restaurant-1",
                List.of(
                        new OrderItem("Pizza Margherita", 1, 4500),
                        new OrderItem("Refrigerante", 2, 700)
                ),
                new DeliveryAddress("Rua das Flores, 123", "São Paulo", "01000-000"));
    }

    @Test
    @DisplayName("cria pedido em AGUARDANDO_ACEITACAO e calcula o total")
    void createsOrder() {
        Order order = newOrder();
        assertThat(order.getStatus()).isEqualTo(OrderStatus.AGUARDANDO_ACEITACAO);
        assertThat(order.getTotalCents()).isEqualTo(4500 + 2 * 700);

        OrderEvents.OrderCreated event = order.toCreatedEvent();
        assertThat(event.type()).isEqualTo("OrderCreated");
        assertThat(event.aggregateId()).isEqualTo(order.getId());
        assertThat(event.totalCents()).isEqualTo(5900);
    }

    @Test
    @DisplayName("rejeita pedido sem itens")
    void rejectsEmptyItems() {
        assertThatThrownBy(() -> Order.create("c", "r", List.of(),
                new DeliveryAddress("Rua", "Cidade", "00000-000")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("ao menos um item");
    }

    @Test
    @DisplayName("CreditReserved -> PREPARANDO e publica OrderApproved")
    void creditReserved() {
        Order order = newOrder();
        OrderEvents.OrderApproved event = order.onCreditReserved(5900);
        assertThat(order.getStatus()).isEqualTo(OrderStatus.PREPARANDO);
        assertThat(event.type()).isEqualTo("OrderApproved");
        assertThat(event.reservedAmountCents()).isEqualTo(5900);
    }

    @Test
    @DisplayName("CreditRejected -> CANCELADO e publica OrderCancelled")
    void creditRejected() {
        Order order = newOrder();
        OrderEvents.OrderCancelled event = order.onCreditRejected("Limite insuficiente.");
        assertThat(order.getStatus()).isEqualTo(OrderStatus.CANCELADO);
        assertThat(order.getCancelReason()).isEqualTo("Limite insuficiente.");
        assertThat(event.type()).isEqualTo("OrderCancelled");
    }

    @Test
    @DisplayName("não permite aprovar pedido fora de AGUARDANDO_ACEITACAO")
    void cannotApproveTwice() {
        Order order = newOrder();
        order.onCreditReserved(5900);
        assertThatThrownBy(() -> order.onCreditReserved(5900))
                .isInstanceOf(InvalidOrderStateTransitionException.class);
    }

    @Test
    @DisplayName("fluxo completo até ENTREGUE publica OrderCreated, OrderApproved e OrderDelivered")
    void fullHappyPath() {
        Order order = newOrder();
        var created = order.toCreatedEvent();
        var approved = order.onCreditReserved(5900);
        order.onTicketPrepared();
        order.onDeliveryScheduled("entregador-42");
        var delivered = order.onDeliveryCompleted();

        assertThat(order.getStatus()).isEqualTo(OrderStatus.ENTREGUE);
        assertThat(order.getCourierId()).isEqualTo("entregador-42");
        assertThat(order.getDeliveredAt()).isNotNull();

        assertThat(List.of(created.type(), approved.type(), delivered.type()))
                .containsExactly("OrderCreated", "OrderApproved", "OrderDelivered");
        assertThat(delivered.courierId()).isEqualTo("entregador-42");
    }

    @Test
    @DisplayName("não permite preparar ticket antes da aprovação de crédito")
    void cannotPrepareBeforeApproval() {
        Order order = newOrder();
        assertThatThrownBy(order::onTicketPrepared)
                .isInstanceOf(InvalidOrderStateTransitionException.class);
    }

    @Test
    @DisplayName("não permite concluir entrega sem entregador atribuído")
    void cannotCompleteWithoutCourier() {
        Order order = newOrder();
        order.onCreditReserved(5900);
        order.onTicketPrepared();
        assertThatThrownBy(order::onDeliveryCompleted)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("entregador");
    }

    @Test
    @DisplayName("não permite cancelar pedido já entregue")
    void cannotCancelAfterDelivered() {
        Order order = newOrder();
        order.onCreditReserved(5900);
        order.onTicketPrepared();
        order.onDeliveryScheduled("entregador-7");
        order.onDeliveryCompleted();
        assertThatThrownBy(() -> order.cancel("Consumidor desistiu."))
                .isInstanceOf(InvalidOrderStateTransitionException.class);
    }
}
