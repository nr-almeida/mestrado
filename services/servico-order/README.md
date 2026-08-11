# ServicoOrder

Primeiro microsserviço implementado a partir do estudo de caso FTGO
(Capítulo 5 da dissertação, Processo **ProMoBD**). Corresponde ao
**core domain** identificado na Macroatividade 2 (EC-M2.1 — *Order
Management*) e à especificação `ServicoOrder` da Macroatividade 4
(EC-M4.3).

Este repositório contém **apenas** este microsserviço por enquanto.
Os demais candidatos definidos na EC-M4.1 (`ServicoAccounting`,
`ServicoKitchen`, `ServicoDelivery`, `ServicoRestaurant`,
`ServicoConsumer`) ainda não foram implementados — ver seção
["Próximos passos"](#próximos-passos) e a nota sobre o endpoint de
simulação de eventos abaixo.

## Por que este é o serviço certo para começar

Na EC-M2.1, o subdomínio *Order Management* foi classificado como o
**core domain** do FTGO: é o fluxo que coordena restaurante, cozinha,
entrega e pagamento (EC-M3.2/EC-M3.3), e a história de usuário de
maior valor de negócio, criticidade operacional e número de contextos
envolvidos (ID 1, Tabela "Histórias de usuário priorizadas") gira em
torno dele. Implementá-lo primeiro segue a própria priorização feita
no estudo de caso.

## Arquitetura

O serviço segue arquitetura hexagonal (Ports & Adapters), para deixar
explícita a fronteira entre regra de negócio e infraestrutura —
alinhado ao objetivo de, futuramente, trocar os adaptadores em memória
por Kafka e PostgreSQL sem tocar no domínio:

```
src/
  domain/                 # Agregado Order, máquina de estados, eventos de domínio
  application/            # Casos de uso (OrderService) + portas (interfaces)
    ports/
      OrderRepository.ts  # porta de persistência (hoje: em memória; futuro: orders_db/Postgres)
      EventPublisher.ts   # porta de publicação de eventos (hoje: em memória; futuro: Kafka)
  infrastructure/
    repository/InMemoryOrderRepository.ts
    events/InMemoryEventBus.ts
    http/app.ts            # rotas Express
    http/server.ts         # bootstrap do processo HTTP
tests/
  unit/Order.test.ts             # regras de negócio / máquina de estados
  integration/orderApi.test.ts   # API HTTP fim-a-fim, incluindo o fluxo de eventos
```

### Máquina de estados do pedido

Reflete o caso de uso "Realizar pedido" (EC-M2.2) e o modelo BPMN
*to-be* do processo *Order Management* (EC-M3.3):

```
AGUARDANDO_ACEITACAO --(CreditReserved)--> PREPARANDO
AGUARDANDO_ACEITACAO --(CreditRejected)--> CANCELADO
PREPARANDO           --(TicketPrepared)--> AGUARDANDO_ENTREGA
AGUARDANDO_ENTREGA    --(DeliveryScheduled)--> AGUARDANDO_ENTREGA (entregador atribuído)
AGUARDANDO_ENTREGA    --(DeliveryCompleted)--> ENTREGUE
```

### API síncrona (EC-M4.3)

| Método | Rota                  | Descrição                                   |
|--------|------------------------|----------------------------------------------|
| GET    | `/health`              | *health check*                                |
| POST   | `/orders`               | cria um pedido (publica `OrderCreated`)       |
| GET    | `/orders/:id`            | consulta um pedido                            |
| GET    | `/orders`                | lista pedidos *(utilitário fora da EC-M4.3, útil para demonstração)* |
| POST   | `/orders/:id/cancel`      | cancelamento direto *(extensão além da EC-M4.3)* |
| GET    | `/events`                 | inspeciona os eventos publicados *(utilitário de demonstração)* |

### Eventos assíncronos

`ServicoOrder` publica `OrderCreated`, `OrderApproved`,
`OrderCancelled`, `OrderDelivered` (tabela de especificação da
EC-M4.3). Em produção, esses eventos seguiriam para o tópico Kafka
`order_events` (EC-M5.2); aqui eles vão para um `InMemoryEventBus`.

Como os outros bounded contexts (`Accounting`, `Kitchen`, `Delivery`)
ainda não existem como serviços, a chegada dos eventos que
`ServicoOrder` consumiria deles é **simulada** via:

```
POST /orders/:id/events
{ "type": "CreditReserved" | "CreditRejected" | "TicketPrepared" | "DeliveryScheduled" | "DeliveryCompleted",
  "payload": { ... } }
```

> **Nota de implementação:** a tabela da EC-M4.3 lista como eventos
> consumidos por `ServicoOrder` apenas `CreditReserved`,
> `CreditRejected`, `TicketPrepared` e `DeliveryScheduled`. O evento
> `OrderDelivered`, porém, só faz sentido reagindo à conclusão efetiva
> da entrega (passo 12 do caso de uso "Realizar pedido": *"atualiza o
> estado do pedido para `ENTREGUE`"*). Por isso este serviço também
> reage a um evento `DeliveryCompleted`, que não estava detalhado na
> tabela da dissertação — uma decisão de implementação explícita, e
> não uma correção silenciosa do texto.

## Como rodar

Pré-requisito: Node.js 20+.

```bash
cd services/servico-order
npm install
npm run dev        # http://localhost:3000, com reload automático
```

## Como comprovar que funciona

### 1. Testes automatizados (23 testes, unitários + integração)

```bash
npm test
```

Cobrem: criação de pedido e cálculo do total; todas as transições de
estado válidas e inválidas; a API HTTP fim-a-fim (incluindo códigos
400/404/409); e o ciclo de vida completo do pedido até `ENTREGUE`,
verificando que os eventos `OrderCreated → OrderApproved →
OrderDelivered` são publicados **na ordem correta**.

### 2. Demonstração manual via `curl`

```bash
npm run build && npm start   # sobe em http://localhost:3000

# cria o pedido
curl -s -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{
    "consumerId": "consumer-1",
    "restaurantId": "restaurant-1",
    "items": [{"name":"Pizza Margherita","quantity":1,"unitPriceCents":4500}],
    "deliveryAddress": {"street":"Rua das Flores, 123","city":"São Paulo","zip":"01000-000"}
  }'
# -> anote o "id" retornado como ORDER_ID

curl -s -X POST http://localhost:3000/orders/ORDER_ID/events \
  -d '{"type":"CreditReserved","payload":{"reservedAmountCents":4500}}' -H "Content-Type: application/json"
curl -s -X POST http://localhost:3000/orders/ORDER_ID/events \
  -d '{"type":"TicketPrepared"}' -H "Content-Type: application/json"
curl -s -X POST http://localhost:3000/orders/ORDER_ID/events \
  -d '{"type":"DeliveryScheduled","payload":{"courierId":"entregador-42"}}' -H "Content-Type: application/json"
curl -s -X POST http://localhost:3000/orders/ORDER_ID/events \
  -d '{"type":"DeliveryCompleted"}' -H "Content-Type: application/json"

curl -s http://localhost:3000/orders/ORDER_ID   # status: ENTREGUE
curl -s http://localhost:3000/events            # eventos publicados, em ordem
```

### 3. CI

Todo push para `main` (ou PR) roda `tsc --noEmit`, a suíte de testes
com cobertura e o build de produção — ver
`.github/workflows/ci.yml`. O selo pode ser adicionado ao README raiz
do repositório depois do primeiro push.

## Próximos passos

- Adaptador Postgres para `OrderRepository` (`orders_db`, per EC-M4.3).
- Adaptador Kafka para `EventPublisher`, substituindo o
  `InMemoryEventBus` (EC-M5.2).
- Implementar `ServicoAccounting` como o próximo microsserviço (é o
  primeiro extraído na Onda 1 do plano de migração, EC-M5.1), e então
  ligar os dois via Kafka de verdade em vez do endpoint de simulação
  `POST /orders/:id/events`.
