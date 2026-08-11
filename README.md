# mestrado

Implementações do estudo de caso FTGO (Capítulo 5 da dissertação
*"Modernização de Sistemas Legados para Microsserviços"*, Processo
ProMoBD) para a defesa de mestrado.

Este repositório é organizado como um monorepo, com um diretório por
microsserviço extraído do monólito FTGO:

```
services/
  servico-order/       # implementado — core domain (Order Management), EC-M4.3
  servico-accounting/  # implementado — autorização de crédito (subdomínio de suporte), EC-M4.3
scripts/
  demo-order-accounting-flow.sh   # prova a integração real entre os dois serviços via HTTP
```

## Status

Dois dos seis microsserviços definidos na EC-M4.1 estão implementados:

- **`ServicoOrder`** — *core domain* do FTGO (EC-M2.1), API síncrona
  `POST/GET /orders`. Ver [`services/servico-order/README.md`](services/servico-order/README.md).
- **`ServicoAccounting`** — subdomínio de suporte, primeiro serviço da
  Onda 1 do plano de migração (EC-M5.1), reage a `OrderCreated`/`OrderCancelled`
  e publica `CreditReserved`/`CreditRejected`. Ver [`services/servico-accounting/README.md`](services/servico-accounting/README.md).

Os dois já foram testados **em conjunto**, como processos HTTP
independentes conversando via eventos (sem broker real ainda) — rode
`./scripts/demo-order-accounting-flow.sh` da raiz do repositório para
ver o fluxo completo: criação do pedido → autorização de crédito →
aprovação ou cancelamento do pedido, em dois cenários (aprovado e
recusado).

Os demais candidatos a microsserviço (`ServicoKitchen`,
`ServicoDelivery`, `ServicoRestaurant`, `ServicoConsumer`) ainda não
foram implementados.

## CI

Cada push/PR roda, via `.github/workflows/ci.yml`:

1. Testes + build de cada serviço, em paralelo (matriz `servico-order` / `servico-accounting`);
2. O script de integração cruzada (`integration-demo`), provando que
   os dois serviços realmente conversam corretamente antes de
   considerar o pipeline verde.
