package br.com.ftgo.order.domain.event;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Contrato genérico de evento de domínio publicado pelo ServicoOrder,
 * alinhado com a especificação de eventos da tabela "Especificação
 * final dos microsserviços do FTGO" (EC-M4.3).
 *
 * Em produção, cada evento seria publicado em um tópico Kafka
 * (ex.: {@code order_events}), conforme a EC-M5.2. Nesta primeira
 * versão (apenas o ServicoOrder), a publicação ocorre em um event bus
 * em memória (ver infrastructure.messaging.InMemoryEventPublisher),
 * substituível por um adaptador Kafka real quando os demais
 * microsserviços forem implementados.
 */
public interface DomainEvent {

    /** Nome do evento (ex.: "OrderCreated"), conforme linguagem ubíqua do FTGO. */
    @JsonProperty("type")
    String type();

    /** Identificador do agregado que originou o evento (orderId). */
    String aggregateId();

    /** Momento em que o evento foi gerado. */
    Instant occurredAt();
}
