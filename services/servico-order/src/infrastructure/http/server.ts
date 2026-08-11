import { buildApp } from './app';
import { OrderService } from '../../application/OrderService';
import { InMemoryOrderRepository } from '../repository/InMemoryOrderRepository';
import { InMemoryEventBus } from '../events/InMemoryEventBus';

const PORT = Number(process.env.PORT ?? 3000);

const orderRepository = new InMemoryOrderRepository();
const eventBus = new InMemoryEventBus();
const orderService = new OrderService(orderRepository, eventBus);

const app = buildApp({ orderService, orderRepository, eventBus });

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[servico-order] ouvindo na porta ${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`[servico-order] health check: http://localhost:${PORT}/health`);
});
