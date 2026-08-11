import { Order } from '../../domain/Order';

/**
 * Porta de saída (Hexagonal Architecture / Ports & Adapters) para
 * persistência do agregado Order. A EC-M4.3 especifica `orders_db`
 * (PostgreSQL) como banco de dados privado do ServicoOrder — nesta
 * primeira versão, usamos um adaptador em memória
 * (InMemoryOrderRepository) para permitir execução e testes sem
 * infraestrutura externa. Um adaptador Postgres pode implementar esta
 * mesma interface sem alterar a camada de aplicação ou de domínio.
 */
export interface OrderRepository {
  save(order: Order): Promise<void>;
  findById(id: string): Promise<Order | null>;
}
