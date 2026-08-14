package br.com.ftgo.order.infrastructure.messaging;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import org.springframework.stereotype.Component;

import br.com.ftgo.order.application.port.EventPublisher;
import br.com.ftgo.order.domain.event.DomainEvent;

/**
 * Publisher de eventos em memória. Registra os eventos que o
 * ServicoOrder publicaria no tópico Kafka {@code order_events}
 * (OrderCreated, OrderApproved, OrderCancelled, OrderDelivered) e
 * permite inspecioná-los via {@code GET /events} — útil para provar,
 * em testes e demonstrações, que os eventos corretos foram publicados
 * na ordem certa.
 *
 * <p>Quando os demais microsserviços forem implementados, este
 * adaptador é substituído por um produtor Kafka real, sem alterar a
 * camada de aplicação (que depende apenas da interface
 * {@link EventPublisher}).</p>
 */
@Component
public class InMemoryEventPublisher implements EventPublisher {

    private final CopyOnWriteArrayList<DomainEvent> published = new CopyOnWriteArrayList<>();

    @Override
    public void publish(DomainEvent event) {
        published.add(event);
    }

    public List<DomainEvent> getPublishedEvents() {
        return List.copyOf(published);
    }

    public void clear() {
        published.clear();
    }
}
