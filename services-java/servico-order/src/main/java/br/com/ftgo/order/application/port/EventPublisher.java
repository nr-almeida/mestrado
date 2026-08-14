package br.com.ftgo.order.application.port;

import br.com.ftgo.order.domain.event.DomainEvent;

/**
 * Porta de saída para publicação de eventos de domínio. Em produção,
 * corresponde ao tópico Kafka {@code order_events} (ver EC-M5.2). Nesta
 * primeira versão, um publisher em memória cumpre esse papel e também
 * permite inspecionar os eventos publicados durante testes e a
 * demonstração.
 */
public interface EventPublisher {

    void publish(DomainEvent event);
}
