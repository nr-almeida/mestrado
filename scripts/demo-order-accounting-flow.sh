#!/usr/bin/env bash
#
# Demonstra a integração entre ServicoOrder e ServicoAccounting,
# dois processos HTTP independentes, sem broker real — os eventos
# publicados por um serviço (GET /events) são repassados ao outro
# (POST /events), no lugar do tópico Kafka `order_events` (EC-M5.2).
#
# Roda dois cenários:
#   A) pedido dentro do limite de crédito -> aprovado -> PREPARANDO
#   B) pedido acima do limite de crédito  -> recusado -> CANCELADO
#
# Uso: ./scripts/demo-order-accounting-flow.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ORDER_DIR="$ROOT_DIR/services/servico-order"
ACCOUNTING_DIR="$ROOT_DIR/services/servico-accounting"

ORDER_PORT=3000
ACCOUNTING_PORT=3001
ORDER_URL="http://localhost:$ORDER_PORT"
ACCOUNTING_URL="http://localhost:$ACCOUNTING_PORT"

ORDER_LOG=$(mktemp)
ACCOUNTING_LOG=$(mktemp)

jsonget() {
  # jsonget '<json>' 'campo.aninhado'
  node -e "
    const data = JSON.parse(process.argv[1]);
    const path = process.argv[2].split('.');
    let cur = data;
    for (const p of path) cur = cur?.[p];
    process.stdout.write(typeof cur === 'string' ? cur : JSON.stringify(cur));
  " "$1" "$2"
}

lastEventOfType() {
  # lastEventOfType '<json-array>' 'TypeName'
  node -e "
    const events = JSON.parse(process.argv[1]);
    const type = process.argv[2];
    const filtered = events.filter(e => e.type === type);
    process.stdout.write(JSON.stringify(filtered[filtered.length - 1]));
  " "$1" "$2"
}

echo "== build dos dois serviços =="
(cd "$ORDER_DIR" && npm run build > /dev/null)
(cd "$ACCOUNTING_DIR" && npm run build > /dev/null)

echo "== subindo ServicoOrder (porta $ORDER_PORT) e ServicoAccounting (porta $ACCOUNTING_PORT) =="
(cd "$ORDER_DIR" && PORT=$ORDER_PORT node dist/infrastructure/http/server.js > "$ORDER_LOG" 2>&1) &
ORDER_PID=$!
(cd "$ACCOUNTING_DIR" && PORT=$ACCOUNTING_PORT ACCOUNTING_DEFAULT_CREDIT_LIMIT_CENTS=10000 node dist/infrastructure/http/server.js > "$ACCOUNTING_LOG" 2>&1) &
ACCOUNTING_PID=$!

cleanup() {
  kill "$ORDER_PID" "$ACCOUNTING_PID" 2>/dev/null || true
}
trap cleanup EXIT

sleep 1
curl -s "$ORDER_URL/health" > /dev/null
curl -s "$ACCOUNTING_URL/health" > /dev/null
echo "ambos os serviços respondendo (PIDs $ORDER_PID e $ACCOUNTING_PID)."
echo

run_scenario() {
  local label="$1" consumer_id="$2" total_cents_desc="$3" order_payload="$4" expected_status="$5"

  echo "---------------------------------------------------------------"
  echo "Cenário: $label"
  echo "---------------------------------------------------------------"

  echo "1) POST $ORDER_URL/orders  (cria o pedido -> publica OrderCreated)"
  CREATE_RES=$(curl -s -X POST "$ORDER_URL/orders" -H "Content-Type: application/json" -d "$order_payload")
  ORDER_ID=$(jsonget "$CREATE_RES" "id")
  echo "   order.id=$ORDER_ID  status=$(jsonget "$CREATE_RES" "status")  totalCents=$(jsonget "$CREATE_RES" "totalCents") ($total_cents_desc)"

  echo "2) GET $ORDER_URL/events  -> localizar o OrderCreated deste pedido"
  ORDER_EVENTS=$(curl -s "$ORDER_URL/events")
  ORDER_CREATED_EVENT=$(node -e "
    const events = JSON.parse(process.argv[1]);
    const id = process.argv[2];
    const ev = events.filter(e => e.type === 'OrderCreated' && e.aggregateId === id).pop();
    process.stdout.write(JSON.stringify(ev));
  " "$ORDER_EVENTS" "$ORDER_ID")

  echo "3) POST $ACCOUNTING_URL/events  (repassa OrderCreated ao ServicoAccounting)"
  ACC_HANDLE_RES=$(curl -s -X POST "$ACCOUNTING_URL/events" -H "Content-Type: application/json" -d "$ORDER_CREATED_EVENT")
  echo "   ServicoAccounting -> reservedCents=$(jsonget "$ACC_HANDLE_RES" "account.reservedCents") availableCents=$(jsonget "$ACC_HANDLE_RES" "account.availableCents")"

  echo "4) GET $ACCOUNTING_URL/events  -> localizar CreditReserved/CreditRejected deste pedido"
  ACC_EVENTS=$(curl -s "$ACCOUNTING_URL/events")
  CREDIT_EVENT=$(node -e "
    const events = JSON.parse(process.argv[1]);
    const id = process.argv[2];
    const ev = events.filter(e => e.aggregateId === id && (e.type === 'CreditReserved' || e.type === 'CreditRejected')).pop();
    process.stdout.write(JSON.stringify(ev));
  " "$ACC_EVENTS" "$ORDER_ID")
  CREDIT_TYPE=$(jsonget "$CREDIT_EVENT" "type")
  echo "   ServicoAccounting publicou: $CREDIT_TYPE"

  echo "5) POST $ORDER_URL/orders/$ORDER_ID/events  (repassa $CREDIT_TYPE de volta ao ServicoOrder)"
  BACK_PAYLOAD=$(node -e "
    const ev = JSON.parse(process.argv[1]);
    process.stdout.write(JSON.stringify({ type: ev.type, payload: ev.payload }));
  " "$CREDIT_EVENT")
  curl -s -X POST "$ORDER_URL/orders/$ORDER_ID/events" -H "Content-Type: application/json" -d "$BACK_PAYLOAD" > /dev/null

  echo "6) GET $ORDER_URL/orders/$ORDER_ID  -> estado final"
  FINAL=$(curl -s "$ORDER_URL/orders/$ORDER_ID")
  FINAL_STATUS=$(jsonget "$FINAL" "status")
  echo "   status final do pedido: $FINAL_STATUS"
  if [ "$FINAL_STATUS" = "CANCELADO" ]; then
    echo "   motivo do cancelamento: $(jsonget "$FINAL" "cancelReason")"
  fi

  if [ "$FINAL_STATUS" != "$expected_status" ]; then
    echo "   FALHA: esperado status=$expected_status, obtido status=$FINAL_STATUS"
    exit 1
  fi
  echo "   OK: status final confere com o esperado ($expected_status)."
  echo
}

# Cenário A: pedido dentro do limite (limite padrão = 10000 centavos)
run_scenario "A - dentro do limite de crédito (aprovado)" "consumer-1" "R\$45,00 <= limite R\$100,00" \
'{"consumerId":"consumer-1","restaurantId":"restaurant-1","items":[{"name":"Pizza Margherita","quantity":1,"unitPriceCents":4500}],"deliveryAddress":{"street":"Rua das Flores, 123","city":"São Paulo","zip":"01000-000"}}' \
"PREPARANDO"

# Cenário B: pedido acima do limite (limite padrão = 10000 centavos)
run_scenario "B - acima do limite de crédito (recusado)" "consumer-2" "R\$150,00 > limite R\$100,00" \
'{"consumerId":"consumer-2","restaurantId":"restaurant-1","items":[{"name":"Rodízio para 6 pessoas","quantity":1,"unitPriceCents":15000}],"deliveryAddress":{"street":"Av. Paulista, 1000","city":"São Paulo","zip":"01310-000"}}' \
"CANCELADO"

echo "== encerrando os servidores =="
echo "TODOS OS CENÁRIOS PASSARAM."
