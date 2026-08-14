package br.com.ftgo.order.domain;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import br.com.ftgo.order.domain.event.OrderEvents;

/**
 * Order (Pedido) — agregado central do bounded context Order Management,
 * identificado como o <em>core domain</em> do FTGO na Macroatividade 2
 * do Processo ProMoBD (EC-M2.1). É o primeiro (e, por ora, único)
 * microsserviço implementado a partir da especificação da EC-M4.3
 * (ServicoOrder).
 *
 * <p>A máquina de estados reflete o fluxo básico e os fluxos
 * alternativos do caso de uso "Realizar pedido":</p>
 *
 * <pre>
 *   AGUARDANDO_ACEITACAO --(CreditReserved)--&gt; PREPARANDO
 *   AGUARDANDO_ACEITACAO --(CreditRejected)--&gt; CANCELADO
 *   PREPARANDO           --(TicketPrepared)--&gt; AGUARDANDO_ENTREGA
 *   AGUARDANDO_ENTREGA   --(DeliveryScheduled)--&gt; AGUARDANDO_ENTREGA (courier atribuído)
 *   AGUARDANDO_ENTREGA   --(DeliveryCompleted)--&gt; ENTREGUE
 * </pre>
 *
 * <p><strong>Nota de implementação:</strong> a tabela de especificação
 * do ServicoOrder (EC-M4.3) lista como eventos consumidos apenas
 * CreditReserved, CreditRejected, TicketPrepared e DeliveryScheduled,
 * mas o evento publicado OrderDelivered só faz sentido reagindo à
 * conclusão efetiva da entrega. Para fechar o ciclo de vida descrito
 * no caso de uso (passo 12: "atualiza o estado do pedido para
 * ENTREGUE"), este agregado também reage a um evento DeliveryCompleted.
 * Essa é uma decisão de implementação explícita — não estava detalhada
 * na tabela da dissertação — documentada aqui e no README do serviço.</p>
 */
public class Order {

    private final String id;
    private final String consumerId;
    private final String restaurantId;
    private final List<OrderItem> items;
    private final DeliveryAddress deliveryAddress;
    private final long totalCents;
    private final Instant createdAt;

    private OrderStatus status;
    private Instant updatedAt;
    private String cancelReason;
    private String courierId;
    private Instant deliveredAt;

    private Order(String id, String consumerId, String restaurantId, List<OrderItem> items,
                  DeliveryAddress deliveryAddress, long totalCents, OrderStatus status,
                  Instant createdAt, Instant updatedAt) {
        this.id = id;
        this.consumerId = consumerId;
        this.restaurantId = restaurantId;
        this.items = List.copyOf(items);
        this.deliveryAddress = deliveryAddress;
        this.totalCents = totalCents;
        this.status = status;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    /**
     * Cria um novo pedido no estado AGUARDANDO_ACEITACAO. O evento
     * OrderCreated correspondente (passo 3 do fluxo básico) é obtido
     * separadamente via {@link #toCreatedEvent()}.
     */
    public static Order create(String consumerId, String restaurantId,
                               List<OrderItem> items, DeliveryAddress deliveryAddress) {
        if (items == null || items.isEmpty()) {
            throw new IllegalArgumentException("O pedido deve conter ao menos um item.");
        }
        long total = items.stream().mapToLong(OrderItem::subtotalCents).sum();
        Instant now = Instant.now();
        return new Order(UUID.randomUUID().toString(), consumerId, restaurantId, items,
                deliveryAddress, total, OrderStatus.AGUARDANDO_ACEITACAO, now, now);
    }

    /**
     * Reconstrói um pedido a partir de um estado previamente persistido
     * (usado pelo repositório). Não produz eventos.
     */
    public static Order restore(String id, String consumerId, String restaurantId, List<OrderItem> items,
                                DeliveryAddress deliveryAddress, long totalCents, OrderStatus status,
                                Instant createdAt, Instant updatedAt, String cancelReason,
                                String courierId, Instant deliveredAt) {
        Order order = new Order(id, consumerId, restaurantId, items, deliveryAddress, totalCents,
                status, createdAt, updatedAt);
        order.cancelReason = cancelReason;
        order.courierId = courierId;
        order.deliveredAt = deliveredAt;
        return order;
    }

    public OrderEvents.OrderCreated toCreatedEvent() {
        return new OrderEvents.OrderCreated(id, consumerId, restaurantId, items, deliveryAddress, totalCents);
    }

    /** Reação ao evento externo CreditReserved (publicado pelo ServicoAccounting). */
    public OrderEvents.OrderApproved onCreditReserved(long reservedAmountCents) {
        if (status != OrderStatus.AGUARDANDO_ACEITACAO) {
            throw new InvalidOrderStateTransitionException(status, "onCreditReserved");
        }
        status = OrderStatus.PREPARANDO;
        touch();
        return new OrderEvents.OrderApproved(id, reservedAmountCents);
    }

    /** Reação ao evento externo CreditRejected (publicado pelo ServicoAccounting). */
    public OrderEvents.OrderCancelled onCreditRejected(String reason) {
        if (status != OrderStatus.AGUARDANDO_ACEITACAO) {
            throw new InvalidOrderStateTransitionException(status, "onCreditRejected");
        }
        status = OrderStatus.CANCELADO;
        cancelReason = reason;
        touch();
        return new OrderEvents.OrderCancelled(id, reason);
    }

    /**
     * Cancelamento direto do pedido (extensão além da tabela de eventos
     * consumidos da EC-M4.3, útil para cancelamentos solicitados pelo
     * consumidor antes do preparo). Não é permitido após ENTREGUE ou já
     * CANCELADO.
     */
    public OrderEvents.OrderCancelled cancel(String reason) {
        if (status == OrderStatus.ENTREGUE || status == OrderStatus.CANCELADO) {
            throw new InvalidOrderStateTransitionException(status, "cancel");
        }
        status = OrderStatus.CANCELADO;
        cancelReason = reason;
        touch();
        return new OrderEvents.OrderCancelled(id, reason);
    }

    /** Reação ao evento externo TicketPrepared (publicado pelo ServicoKitchen). */
    public void onTicketPrepared() {
        if (status != OrderStatus.PREPARANDO) {
            throw new InvalidOrderStateTransitionException(status, "onTicketPrepared");
        }
        status = OrderStatus.AGUARDANDO_ENTREGA;
        touch();
        // Sem evento publicado nesta transição, conforme a coluna
        // "Eventos publicados" do ServicoOrder (EC-M4.3).
    }

    /** Reação ao evento externo DeliveryScheduled (publicado pelo ServicoDelivery). */
    public void onDeliveryScheduled(String courierId) {
        if (status != OrderStatus.AGUARDANDO_ENTREGA) {
            throw new InvalidOrderStateTransitionException(status, "onDeliveryScheduled");
        }
        this.courierId = courierId;
        touch();
        // Idem: sem evento publicado; apenas atribuição do entregador.
    }

    /**
     * Reação à conclusão da entrega (ver nota de implementação no
     * cabeçalho da classe) — fecha o ciclo de vida do pedido e produz o
     * evento OrderDelivered.
     */
    public OrderEvents.OrderDelivered onDeliveryCompleted() {
        if (status != OrderStatus.AGUARDANDO_ENTREGA) {
            throw new InvalidOrderStateTransitionException(status, "onDeliveryCompleted");
        }
        if (courierId == null) {
            throw new IllegalStateException("Não é possível concluir a entrega sem um entregador atribuído.");
        }
        status = OrderStatus.ENTREGUE;
        deliveredAt = Instant.now();
        touch();
        return new OrderEvents.OrderDelivered(id, courierId, deliveredAt);
    }

    private void touch() {
        this.updatedAt = Instant.now();
    }

    public String getId() {
        return id;
    }

    public String getConsumerId() {
        return consumerId;
    }

    public String getRestaurantId() {
        return restaurantId;
    }

    public List<OrderItem> getItems() {
        return items;
    }

    public DeliveryAddress getDeliveryAddress() {
        return deliveryAddress;
    }

    public long getTotalCents() {
        return totalCents;
    }

    public OrderStatus getStatus() {
        return status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public String getCancelReason() {
        return cancelReason;
    }

    public String getCourierId() {
        return courierId;
    }

    public Instant getDeliveredAt() {
        return deliveredAt;
    }
}
