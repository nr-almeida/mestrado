# ServicoOrder (Java / Spring Boot)

Implementação em **Java 21 + Spring Boot 3.3** do `ServicoOrder` — o
*core domain* (Order Management) do estudo de caso FTGO, conforme o
Capítulo 5 da dissertação (Processo **ProMoBD**).

É uma segunda implementação do mesmo microsserviço já feito em
TypeScript/Node (ver `../../services/servico-order`), na stack descrita
pela própria dissertação: o FTGO legado é Java/Spring Boot, e a
EC-M5.3 afirma que o `ServicoAccounting` "foi desenvolvido utilizando
Java e Spring Boot". Ter as duas versões evidencia que o método
ProMoBD é agnóstico de linguagem — o mesmo bounded context, com as
mesmas regras de domínio e os mesmos contratos de evento, funciona em
ambas as stacks.

## Arquitetura

Arquitetura hexagonal (Ports & Adapters), idêntica em intenção à versão
Node:

```
src/main/java/br/com/ftgo/order/
  domain/                         # Order (agregado), OrderStatus, value objects
    event/                        # DomainEvent + OrderEvents (records dos 4 eventos)
  application/
    OrderService.java             # casos de uso
    port/                         # OrderRepository, EventPublisher (interfaces)
  infrastructure/
    persistence/                  # InMemoryOrderRepository (hoje) -> Postgres/JPA (futuro)
    messaging/                    # InMemoryEventPublisher (hoje) -> Kafka (futuro)
    rest/                         # OrderController, DTOs, handler de erros
  ServicoOrderApplication.java    # main Spring Boot
```

### Máquina de estados (EC-M2.2 / EC-M3.3)

```
AGUARDANDO_ACEITACAO --(CreditReserved)--> PREPARANDO
AGUARDANDO_ACEITACAO --(CreditRejected)--> CANCELADO
PREPARANDO           --(TicketPrepared)--> AGUARDANDO_ENTREGA
AGUARDANDO_ENTREGA    --(DeliveryScheduled)--> AGUARDANDO_ENTREGA (entregador atribuído)
AGUARDANDO_ENTREGA    --(DeliveryCompleted)--> ENTREGUE
```

### API síncrona (EC-M4.3)

| Método | Rota                    | Descrição |
|--------|--------------------------|-----------|
| GET    | `/actuator/health`       | *health check* (Spring Actuator) |
| POST   | `/orders`                 | cria um pedido (publica `OrderCreated`) |
| GET    | `/orders/{id}`             | consulta um pedido |
| GET    | `/orders`                  | lista pedidos *(utilitário)* |
| POST   | `/orders/{id}/cancel`       | cancelamento direto *(extensão)* |
| POST   | `/orders/{id}/events`        | simula evento externo *(no lugar do Kafka)* |
| GET    | `/events`                    | inspeciona os eventos publicados *(utilitário)* |

Eventos publicados (EC-M4.3): `OrderCreated`, `OrderApproved`,
`OrderCancelled`, `OrderDelivered`. Eventos consumidos (via
`POST /orders/{id}/events` enquanto não há Kafka): `CreditReserved`,
`CreditRejected`, `TicketPrepared`, `DeliveryScheduled` e
`DeliveryCompleted`.

> **Nota de implementação:** `DeliveryCompleted` não consta na tabela
> de eventos consumidos da EC-M4.3, mas sem ele o pedido nunca chega a
> `ENTREGUE` (passo 12 do caso de uso "Realizar pedido"). Foi
> adicionado como decisão de implementação explícita, igual à versão
> Node — vale mencionar na defesa.

## Como rodar

Pré-requisitos: JDK 21 e Maven 3.9+ (ou deixe o CI do GitHub rodar).

```bash
cd services-java/servico-order
mvn spring-boot:run      # sobe em http://localhost:8080
```

## Como comprovar que funciona

### Testes automatizados

```bash
mvn clean verify
```

- **Unitários (`OrderTest`)** — máquina de estados do agregado: criação
  e cálculo do total, todas as transições válidas e inválidas, fluxo
  completo até `ENTREGUE` verificando a ordem dos eventos.
- **Integração (`OrderControllerTest`, MockMvc)** — API HTTP fim a fim:
  201/400/404/409, ciclo de vida completo via eventos simulados,
  cancelamento por `CreditRejected`, e `GET /events` comprovando a
  ordem `OrderCreated → OrderApproved → OrderDelivered`.

### Demonstração manual via `curl`

```bash
mvn spring-boot:run   # http://localhost:8080

curl -s -X POST http://localhost:8080/orders \
  -H "Content-Type: application/json" \
  -d '{
    "consumerId":"consumer-1","restaurantId":"restaurant-1",
    "items":[{"name":"Pizza Margherita","quantity":1,"unitPriceCents":4500}],
    "deliveryAddress":{"street":"Rua das Flores, 123","city":"São Paulo","zip":"01000-000"}
  }'
# anote o "id" e siga com os eventos:

curl -s -X POST http://localhost:8080/orders/ID/events \
  -d '{"type":"CreditReserved","payload":{"reservedAmountCents":4500}}' -H "Content-Type: application/json"
curl -s -X POST http://localhost:8080/orders/ID/events \
  -d '{"type":"TicketPrepared"}' -H "Content-Type: application/json"
curl -s -X POST http://localhost:8080/orders/ID/events \
  -d '{"type":"DeliveryScheduled","payload":{"courierId":"entregador-42"}}' -H "Content-Type: application/json"
curl -s -X POST http://localhost:8080/orders/ID/events \
  -d '{"type":"DeliveryCompleted"}' -H "Content-Type: application/json"

curl -s http://localhost:8080/orders/ID    # status: ENTREGUE
curl -s http://localhost:8080/events        # eventos publicados, em ordem
```

### CI

`.github/workflows/ci-java.yml` roda `mvn clean verify` (compilação +
todos os testes) a cada push/PR que toque em
`services-java/servico-order/**`.

## Próximos passos

- Adaptador Postgres/JPA para `OrderRepository` (`orders_db`).
- Adaptador Kafka (Spring for Apache Kafka) para `EventPublisher`,
  substituindo o `InMemoryEventPublisher` e o endpoint de simulação.
