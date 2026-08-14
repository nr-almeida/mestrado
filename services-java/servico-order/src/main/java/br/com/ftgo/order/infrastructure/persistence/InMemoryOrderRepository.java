package br.com.ftgo.order.infrastructure.persistence;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Repository;

import br.com.ftgo.order.application.port.OrderRepository;
import br.com.ftgo.order.domain.Order;

/**
 * Implementação em memória da porta {@link OrderRepository}. Adequada
 * para demonstração, testes automatizados e desenvolvimento local. A
 * troca por um adaptador PostgreSQL/JPA ({@code orders_db}, ver
 * EC-M4.3/EC-M5.2) não exige nenhuma mudança na camada de aplicação ou
 * de domínio.
 */
@Repository
public class InMemoryOrderRepository implements OrderRepository {

    private final ConcurrentHashMap<String, Order> store = new ConcurrentHashMap<>();

    @Override
    public void save(Order order) {
        store.put(order.getId(), order);
    }

    @Override
    public Optional<Order> findById(String id) {
        return Optional.ofNullable(store.get(id));
    }

    @Override
    public List<Order> findAll() {
        return List.copyOf(store.values());
    }
}
