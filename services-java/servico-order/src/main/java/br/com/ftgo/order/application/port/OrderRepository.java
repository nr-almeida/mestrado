package br.com.ftgo.order.application.port;

import java.util.List;
import java.util.Optional;

import br.com.ftgo.order.domain.Order;

/**
 * Porta de saída (Hexagonal Architecture / Ports &amp; Adapters) para
 * persistência do agregado Order. A EC-M4.3 especifica {@code orders_db}
 * (PostgreSQL) como banco de dados privado do ServicoOrder — nesta
 * primeira versão, um adaptador em memória (InMemoryOrderRepository)
 * implementa esta interface, permitindo execução e testes sem
 * infraestrutura externa. Um adaptador Postgres/JPA pode implementá-la
 * sem alterar a camada de aplicação ou de domínio.
 */
public interface OrderRepository {

    void save(Order order);

    Optional<Order> findById(String id);

    List<Order> findAll();
}
