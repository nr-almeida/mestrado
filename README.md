# mestrado

Implementações do estudo de caso FTGO (Capítulo 5 da dissertação
*"Modernização de Sistemas Legados para Microsserviços"*, Processo
ProMoBD) para a defesa de mestrado.

Este repositório é organizado como um monorepo, com um diretório por
microsserviço extraído do monólito FTGO:

```
services/
  servico-order/   # implementado — core domain (Order Management), EC-M4.3
```

## Status

Por enquanto, apenas o `ServicoOrder` foi implementado — é o *core
domain* do FTGO, conforme identificado na EC-M2.1 e priorizado na
EC-M3.1. Ver [`services/servico-order/README.md`](services/servico-order/README.md)
para arquitetura, como rodar e como comprovar que ele funciona
(testes automatizados + demonstração via `curl`).

Os demais candidatos a microsserviço definidos na EC-M4.1
(`ServicoAccounting`, `ServicoKitchen`, `ServicoDelivery`,
`ServicoRestaurant`, `ServicoConsumer`) ainda não foram implementados.

## CI

Cada push/PR que altera `services/servico-order/**` roda a suíte de
testes automaticamente (`.github/workflows/ci.yml`).
