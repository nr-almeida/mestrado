# ServicoAccounting

Segundo microsserviço implementado a partir do estudo de caso FTGO
(Capítulo 5 da dissertação, Processo **ProMoBD**). Corresponde ao
subdomínio de suporte *Accounting*, identificado na EC-M2.1, e à
especificação `ServicoAccounting` da Macroatividade 4 (EC-M4.3).

É também o primeiro serviço a ser extraído do monólito segundo o
plano de migração (**Onda 1**, EC-M5.1) — antes até do próprio
`ServicoOrder`, por ter o menor acoplamento com o restante do sistema.

## Responsabilidade

Autoriza (ou recusa) a reserva de crédito de um pedido, respeitando o
limite de crédito do consumidor. Não expõe API síncrona própria — a
tabela de especificação da EC-M4.3 marca "---" para este serviço.
Ele reage exclusivamente a eventos:

- **Consome** `OrderCreated` → tenta reservar `totalCents` de crédito
  para o consumidor do pedido; publica `CreditReserved` (se houver
  limite disponível) ou `CreditRejected` (caso contrário).
- **Consome** `OrderCancelled` → libera uma reserva ainda ativa, como
  ação compensatória do padrão Saga coreografada (EC-M4.4). Não
  publica um novo evento — a tabela de especificação não lista
  nenhum evento adicional para esse caso.

O agregado `CreditAccount` (`src/domain/CreditAccount.ts`) encapsula
essa invariante: a soma dos valores reservados nunca pode ultrapassar
o limite de crédito do consumidor.

## Arquitetura

Mesmo padrão hexagonal do `ServicoOrder` (ver
[`../servico-order/README.md`](../servico-order/README.md)):
domínio isolado de infraestrutura via portas (`CreditAccountRepository`,
`EventPublisher`), hoje com adaptadores em memória, trocáveis por
Postgres (`accounting_db`, EC-M4.3) e Kafka (EC-M5.2) sem alterar o
domínio ou os casos de uso.

## Eventos consumidos, no formato do envelope

O `POST /events` aceita exatamente o mesmo formato de envelope
publicado pelo `GET /events` do `ServicoOrder`
(`{ type, aggregateId, payload }`), permitindo repassar um evento de
um serviço para o outro sem transformação:

```
POST /events
{ "type": "OrderCreated", "aggregateId": "<orderId>",
  "payload": { "consumerId": "...", "totalCents": 4500, ... } }

POST /events
{ "type": "OrderCancelled", "aggregateId": "<orderId>",
  "payload": { "reason": "..." } }
```

> **Nota de implementação:** para localizar a conta de crédito a
> partir de um `OrderCancelled` (que carrega apenas `orderId` e
> `reason`, sem `consumerId`), o repositório indexa autorizações por
> pedido (`findByOrderId`) — ver `CreditAccountRepository.ts`.

## Endpoints utilitários (fora da EC-M4.3)

Como o serviço não tem API síncrona própria na especificação, alguns
endpoints existem só para permitir configuração e inspeção durante
demonstração/testes:

| Método | Rota                          | Descrição |
|--------|--------------------------------|-----------|
| GET    | `/health`                       | *health check* |
| POST   | `/credit-accounts`               | cria/ajusta o limite de crédito de um consumidor |
| GET    | `/credit-accounts/:consumerId`    | consulta uma conta |
| GET    | `/credit-accounts`                | lista todas as contas |
| GET    | `/events`                         | inspeciona os eventos publicados |

Se `OrderCreated` chega para um consumidor sem conta registrada, uma
conta é criada automaticamente com o limite padrão do serviço
(env var `ACCOUNTING_DEFAULT_CREDIT_LIMIT_CENTS`, padrão: 10000 = R$100,00).

## Como rodar

```bash
cd services/servico-accounting
npm install
npm run dev   # http://localhost:3001
```

## Como comprovar que funciona

### 1. Testes automatizados (22 testes)

```bash
npm test
```

Cobrem: aprovação e recusa de reserva conforme o limite disponível;
múltiplas reservas simultâneas do mesmo consumidor; **idempotência**
ao processar o mesmo `OrderCreated` duas vezes (não reserva nem
publica evento duplicado); liberação de reserva via `OrderCancelled`
(inclusive para pedido desconhecido, sem falhar); e toda a API HTTP.

### 2. Integração real com o ServicoOrder (prova mais forte)

Da raiz do monorepo:

```bash
./scripts/demo-order-accounting-flow.sh
```

Esse script sobe os dois serviços como processos HTTP independentes
(sem broker real) e roda dois cenários ponta a ponta, repassando os
eventos publicados por um serviço para o `POST /events` do outro —
no lugar do tópico Kafka `order_events`:

- **Cenário A** — pedido de R$45,00 (dentro do limite padrão de
  R$100,00): `ServicoAccounting` publica `CreditReserved` →
  `ServicoOrder` transiciona para `PREPARANDO`.
- **Cenário B** — pedido de R$150,00 (acima do limite): `ServicoAccounting`
  publica `CreditRejected` → `ServicoOrder` transiciona para `CANCELADO`.

O script valida o status final de cada pedido e encerra com código de
saída diferente de zero se algo não bater — por isso também roda
automaticamente no CI (`integration-demo`, em `.github/workflows/ci.yml`).

## Próximos passos

- Adaptador Postgres para `CreditAccountRepository` (`accounting_db`).
- Adaptador Kafka para `EventPublisher`, substituindo tanto este
  `InMemoryEventBus` quanto o endpoint `POST /events` de simulação.
- Implementar `ServicoKitchen` (próximo da Onda 2 do plano de
  migração, EC-M5.1), reagindo a `OrderApproved` e publicando
  `TicketPrepared`.
