import { Order } from '../../domain/Order';
import { OrderRepository } from '../../application/ports/OrderRepository';

/**
 * Implementação em memória da porta OrderRepository. Adequada para
 * demonstração, testes automatizados e desenvolvimento local. A troca
 * por um adaptador PostgreSQL (orders_db, ver EC-M4.3/EC-M5.2) não
 * exige nenhuma mudança na camada de aplicação ou de domínio.
 */
export class InMemoryOrderRepository implements OrderRepository {
  private readonly store = new Map<string, Order>();

  async save(order: Order): Promise<void> {
    this.store.set(order.id, order);
  }

  async findById(id: string): Promise<Order | null> {
    return this.store.get(id) ?? null;
  }

  /** Utilitário de teste/depuração — lista todos os pedidos persistidos. */
  async findAll(): Promise<Order[]> {
    return Array.from(this.store.values());
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}
