import { CreditAccount, DuplicateOrderProcessingError } from '../../src/domain/CreditAccount';
import { AuthorizationStatus } from '../../src/domain/AuthorizationStatus';

describe('CreditAccount (agregado — bounded context Accounting)', () => {
  it('reserva crédito e publica CreditReserved quando há limite disponível', () => {
    const account = CreditAccount.create('consumer-1', 10000);
    const event = account.reserve('order-1', 4500);

    expect(event.type).toBe('CreditReserved');
    expect(event.aggregateId).toBe('order-1');
    expect(event.payload).toMatchObject({ consumerId: 'consumer-1', reservedAmountCents: 4500 });
    expect(account.reservedCents).toBe(4500);
    expect(account.availableCents).toBe(5500);
    expect(account.getAuthorization('order-1')?.status).toBe(AuthorizationStatus.RESERVED);
  });

  it('recusa a reserva e publica CreditRejected quando o valor excede o disponível', () => {
    const account = CreditAccount.create('consumer-1', 4000);
    const event = account.reserve('order-1', 4500);

    expect(event.type).toBe('CreditRejected');
    expect(event.payload).toMatchObject({ consumerId: 'consumer-1' });
    expect((event.payload as { reason: string }).reason).toMatch(/insuficiente/i);
    expect(account.reservedCents).toBe(0);
    expect(account.getAuthorization('order-1')?.status).toBe(AuthorizationStatus.REJECTED);
  });

  it('permite reservar até exatamente o limite disponível', () => {
    const account = CreditAccount.create('consumer-1', 5000);
    const event = account.reserve('order-1', 5000);

    expect(event.type).toBe('CreditReserved');
    expect(account.availableCents).toBe(0);
  });

  it('considera reservas simultâneas de pedidos diferentes ao calcular o disponível', () => {
    const account = CreditAccount.create('consumer-1', 10000);
    account.reserve('order-1', 4000);
    const second = account.reserve('order-2', 7000); // 4000 + 7000 > 10000

    expect(second.type).toBe('CreditRejected');
    expect(account.reservedCents).toBe(4000); // só a primeira reserva ficou de pé
  });

  it('lança DuplicateOrderProcessingError ao processar o mesmo pedido duas vezes', () => {
    const account = CreditAccount.create('consumer-1', 10000);
    account.reserve('order-1', 4000);

    expect(() => account.reserve('order-1', 4000)).toThrow(DuplicateOrderProcessingError);
  });

  it('rejeita valores de reserva menores ou iguais a zero', () => {
    const account = CreditAccount.create('consumer-1', 10000);
    expect(() => account.reserve('order-1', 0)).toThrow(/maior que zero/i);
  });

  it('libera uma reserva ativa (compensação via OrderCancelled) sem publicar evento', () => {
    const account = CreditAccount.create('consumer-1', 10000);
    account.reserve('order-1', 4000);

    account.release('order-1');

    expect(account.reservedCents).toBe(0);
    expect(account.availableCents).toBe(10000);
    expect(account.getAuthorization('order-1')?.status).toBe(AuthorizationStatus.RELEASED);
  });

  it('é idempotente ao liberar um pedido desconhecido ou já liberado', () => {
    const account = CreditAccount.create('consumer-1', 10000);

    expect(() => account.release('pedido-inexistente')).not.toThrow();

    account.reserve('order-1', 4000);
    account.release('order-1');
    expect(() => account.release('order-1')).not.toThrow();
    expect(account.getAuthorization('order-1')?.status).toBe(AuthorizationStatus.RELEASED);
  });

  it('não libera crédito de um pedido que foi recusado (nada estava reservado)', () => {
    const account = CreditAccount.create('consumer-1', 1000);
    account.reserve('order-1', 5000); // recusado

    account.release('order-1');
    expect(account.getAuthorization('order-1')?.status).toBe(AuthorizationStatus.REJECTED);
  });

  it('changeCreditLimit ajusta o limite sem afetar reservas existentes', () => {
    const account = CreditAccount.create('consumer-1', 5000);
    account.reserve('order-1', 4000);
    account.changeCreditLimit(20000);

    expect(account.creditLimitCents).toBe(20000);
    expect(account.availableCents).toBe(16000);
  });

  it('rejeita limite de crédito negativo', () => {
    expect(() => CreditAccount.create('consumer-1', -1)).toThrow(/negativo/i);
    const account = CreditAccount.create('consumer-1', 100);
    expect(() => account.changeCreditLimit(-1)).toThrow(/negativo/i);
  });
});
