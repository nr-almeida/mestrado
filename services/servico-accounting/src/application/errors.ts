export class CreditAccountNotFoundError extends Error {
  constructor(consumerId: string) {
    super(`Conta de crédito do consumidor "${consumerId}" não encontrada.`);
    this.name = 'CreditAccountNotFoundError';
  }
}
