# services-java

Implementações em **Java / Spring Boot** dos microsserviços do estudo
de caso FTGO (Processo ProMoBD, Capítulo 5 da dissertação).

Esta pasta é paralela a `../services`, que contém as versões em
**TypeScript / Node**. As duas trilhas implementam os mesmos bounded
contexts, com as mesmas regras de domínio e os mesmos contratos de
evento — o que evidencia que o método ProMoBD é agnóstico de
linguagem.

A stack Java é a descrita pela própria dissertação: o FTGO legado é
Java/Spring Boot e a EC-M5.3 menciona explicitamente o uso dessa stack
na extração dos microsserviços.

## Serviços

```
services-java/
  servico-order/   # implementado — core domain (Order Management), EC-M4.3
```

Por enquanto, apenas o `ServicoOrder` foi portado para Java (o *core
domain*). Ver [`servico-order/README.md`](servico-order/README.md) para
arquitetura, como rodar e como comprovar que funciona.
