import { randomUUID } from 'crypto';
import { OrderStatus } from './OrderStatus';
import { OrderItem, DeliveryAddress } from './OrderTypes';
import { DomainEvent } from './events/DomainEvent';
import {
  OrderApproved,
  OrderApprovedPayload,
  OrderCancelled,
  OrderCancelledPayload,
  OrderCreated,
  OrderCreatedPayload,
  OrderDelivered,
  OrderDeliveredPayload,
} from './events/OrderEvents';

/**
 * Erro de domínio lançado quando uma transição de estado é solicitada
 * a partir de um estado que não a permite (ex.: aprovar um pedido já
 * cancelado). Mantém a máquina de estados consistente com o fluxo
 * descrito no caso de uso "Realizar pedido" (EC-M2.2) e no modelo
 * BPMN to-be do processo Order Management (EC-M3.3).
 */
export class InvalidOrderStateTransitionError extends Error {
  constructor(from: OrderStatus, action: string) {
    super(`Não é possível executar "${action}" a partir do estado "${from}".`);
    this.name = 'InvalidOrderStateTransitionError';
  }
}

export interface CreateOrderProps {
  consumerId: string;
  restaurantId: string;
  items: OrderItem[];
  deliveryAddress: DeliveryAddress;
}

/**
 * Order (Pedido) — agregado central do bounded context Order Management,
 * identificado como o *core domain* do FTGO na Macroatividade 2 do
 * Processo ProMoBD (EC-M2.1). É o primeiro (e, por ora, único)
 * microsserviço implementado a partir da especificação da EC-M4.3
 * (ServicoOrder).
 *
 * A máquina de estados reflete o fluxo básico e os fluxos alternativos
 * do caso de uso "Realizar pedido":
 *
 *   AGUARDANDO_ACEITACAO --(CreditReserved)--> PREPARANDO
 *   AGUARDANDO_ACEITACAO --(CreditRejected)--> CANCELADO
 *   PREPARANDO           --(TicketPrepared)--> AGUARDANDO_ENTREGA
 *   AGUARDANDO_ENTREGA    --(DeliveryScheduled)--> AGUARDANDO_ENTREGA (courier atribuído)
 *   AGUARDANDO_ENTREGA    --(DeliveryCompleted)--> ENTREGUE
 *
 * Nota de implementação: a tabela de especificação do ServicoOrder
 * (EC-M4.3) lista como eventos consumidos apenas CreditReserved,
 * CreditRejected, TicketPrepared e DeliveryScheduled, mas o evento
 * publicado OrderDelivered só faz sentido reagindo à conclusão efetiva
 * da entrega. Para fechar o ciclo de vida descrito no caso de uso
 * (passo 12: "atualiza o estado do pedido para ENTREGUE"), este
 * agregado também reage a um evento DeliveryCompleted. Essa é uma
 * decisão de implementação explícita — não estava detalhada na tabela
 * da dissertação — documentada aqui e no README do serviço.
 */
export class Order {
  readonly id: string;
  readonly consumerId: string;
  readonly restaurantId: string;
  readonly items: OrderItem[];
  readonly deliveryAddress: DeliveryAddress;
  readonly totalCents: number;
  readonly createdAt: string;

  private _status: OrderStatus;
  private _updatedAt: string;
  private _cancelReason?: string;
  private _courierId?: string;
  private _deliveredAt?: string;

  private constructor(props: {
    id: string;
    consumerId: string;
    restaurantId: string;
    items: OrderItem[];
    deliveryAddress: DeliveryAddress;
    totalCents: number;
    status: OrderStatus;
    createdAt: string;
    updatedAt: string;
  }) {
    this.id = props.id;
    this.consumerId = props.consumerId;
    this.restaurantId = props.restaurantId;
    this.items = props.items;
    this.deliveryAddress = props.deliveryAddress;
    this.totalCents = props.totalCents;
    this._status = props.status;
    this.createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  get status(): OrderStatus {
    return this._status;
  }

  get updatedAt(): string {
    return this._updatedAt;
  }

  get cancelReason(): string | undefined {
    return this._cancelReason;
  }

  get courierId(): string | undefined {
    return this._courierId;
  }

  get deliveredAt(): string | undefined {
    return this._deliveredAt;
  }

  /**
   * Cria um novo pedido no estado AGUARDANDO_ACEITACAO e produz o
   * evento OrderCreated (passo 3 do fluxo básico do caso de uso).
   */
  static create(props: CreateOrderProps): { order: Order; event: DomainEvent<OrderCreatedPayload> } {
    if (!props.items || props.items.length === 0) {
      throw new Error('O pedido deve conter ao menos um item.');
    }
    if (props.items.some((i) => i.quantity <= 0 || i.unitPriceCents < 0)) {
      throw new Error('Itens do pedido possuem quantidade ou preço inválidos.');
    }

    const now = new Date().toISOString();
    const totalCents = props.items.reduce((sum, i) => sum + i.quantity * i.unitPriceCents, 0);

    const order = new Order({
      id: randomUUID(),
      consumerId: props.consumerId,
      restaurantId: props.restaurantId,
      items: props.items,
      deliveryAddress: props.deliveryAddress,
      totalCents,
      status: OrderStatus.AGUARDANDO_ACEITACAO,
      createdAt: now,
      updatedAt: now,
    });

    const event = OrderCreated(order.id, {
      consumerId: order.consumerId,
      restaurantId: order.restaurantId,
      items: order.items,
      deliveryAddress: order.deliveryAddress,
      totalCents: order.totalCents,
    });

    return { order, event };
  }

  /**
   * Reconstrói um pedido a partir de um estado previamente persistido
   * (usado pelo repositório). Não produz eventos.
   */
  static restore(state: {
    id: string;
    consumerId: string;
    restaurantId: string;
    items: OrderItem[];
    deliveryAddress: DeliveryAddress;
    totalCents: number;
    status: OrderStatus;
    createdAt: string;
    updatedAt: string;
    cancelReason?: string;
    courierId?: string;
    deliveredAt?: string;
  }): Order {
    const order = new Order(state);
    order._cancelReason = state.cancelReason;
    order._courierId = state.courierId;
    order._deliveredAt = state.deliveredAt;
    return order;
  }

  /** Reação ao evento externo CreditReserved (publicado pelo ServicoAccounting). */
  onCreditReserved(reservedAmountCents: number): DomainEvent<OrderApprovedPayload> {
    if (this._status !== OrderStatus.AGUARDANDO_ACEITACAO) {
      throw new InvalidOrderStateTransitionError(this._status, 'onCreditReserved');
    }
    this._status = OrderStatus.PREPARANDO;
    this.touch();
    return OrderApproved(this.id, { reservedAmountCents });
  }

  /** Reação ao evento externo CreditRejected (publicado pelo ServicoAccounting). */
  onCreditRejected(reason: string): DomainEvent<OrderCancelledPayload> {
    if (this._status !== OrderStatus.AGUARDANDO_ACEITACAO) {
      throw new InvalidOrderStateTransitionError(this._status, 'onCreditRejected');
    }
    this._status = OrderStatus.CANCELADO;
    this._cancelReason = reason;
    this.touch();
    return OrderCancelled(this.id, { reason });
  }

  /**
   * Cancelamento direto do pedido (extensão além da tabela de eventos
   * consumidos da EC-M4.3, útil para cancelamentos solicitados pelo
   * consumidor antes do preparo). Não é permitido após ENTREGUE ou
   * já CANCELADO.
   */
  cancel(reason: string): DomainEvent<OrderCancelledPayload> {
    if (this._status === OrderStatus.ENTREGUE || this._status === OrderStatus.CANCELADO) {
      throw new InvalidOrderStateTransitionError(this._status, 'cancel');
    }
    this._status = OrderStatus.CANCELADO;
    this._cancelReason = reason;
    this.touch();
    return OrderCancelled(this.id, { reason });
  }

  /** Reação ao evento externo TicketPrepared (publicado pelo ServicoKitchen). */
  onTicketPrepared(): void {
    if (this._status !== OrderStatus.PREPARANDO) {
      throw new InvalidOrderStateTransitionError(this._status, 'onTicketPrepared');
    }
    this._status = OrderStatus.AGUARDANDO_ENTREGA;
    this.touch();
    // Não há evento publicado nesta transição, conforme especificação
    // de eventos publicados do ServicoOrder (EC-M4.3).
  }

  /** Reação ao evento externo DeliveryScheduled (publicado pelo ServicoDelivery). */
  onDeliveryScheduled(courierId: string): void {
    if (this._status !== OrderStatus.AGUARDANDO_ENTREGA) {
      throw new InvalidOrderStateTransitionError(this._status, 'onDeliveryScheduled');
    }
    this._courierId = courierId;
    this.touch();
    // Idem: sem evento publicado; apenas atribuição do entregador.
  }

  /**
   * Reação à conclusão da entrega (ver nota de implementação no
   * cabeçalho da classe) — fecha o ciclo de vida do pedido e produz
   * o evento OrderDelivered.
   */
  onDeliveryCompleted(): DomainEvent<OrderDeliveredPayload> {
    if (this._status !== OrderStatus.AGUARDANDO_ENTREGA) {
      throw new InvalidOrderStateTransitionError(this._status, 'onDeliveryCompleted');
    }
    if (!this._courierId) {
      throw new Error('Não é possível concluir a entrega sem um entregador atribuído.');
    }
    this._status = OrderStatus.ENTREGUE;
    this._deliveredAt = new Date().toISOString();
    this.touch();
    return OrderDelivered(this.id, {
      courierId: this._courierId,
      deliveredAt: this._deliveredAt,
    });
  }

  private touch(): void {
    this._updatedAt = new Date().toISOString();
  }

  toJSON() {
    return {
      id: this.id,
      consumerId: this.consumerId,
      restaurantId: this.restaurantId,
      items: this.items,
      deliveryAddress: this.deliveryAddress,
      totalCents: this.totalCents,
      status: this._status,
      courierId: this._courierId,
      cancelReason: this._cancelReason,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
      deliveredAt: this._deliveredAt,
    };
  }
}
