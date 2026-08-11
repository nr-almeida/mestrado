import { DomainEvent, createEvent } from './DomainEvent';
import { OrderItem, DeliveryAddress } from '../OrderTypes';

export interface OrderCreatedPayload {
  consumerId: string;
  restaurantId: string;
  items: OrderItem[];
  deliveryAddress: DeliveryAddress;
  totalCents: number;
}
export const OrderCreated = (
  orderId: string,
  payload: OrderCreatedPayload
): DomainEvent<OrderCreatedPayload> => createEvent('OrderCreated', orderId, payload);

export interface OrderApprovedPayload {
  reservedAmountCents: number;
}
export const OrderApproved = (
  orderId: string,
  payload: OrderApprovedPayload
): DomainEvent<OrderApprovedPayload> => createEvent('OrderApproved', orderId, payload);

export interface OrderCancelledPayload {
  reason: string;
}
export const OrderCancelled = (
  orderId: string,
  payload: OrderCancelledPayload
): DomainEvent<OrderCancelledPayload> => createEvent('OrderCancelled', orderId, payload);

export interface OrderDeliveredPayload {
  courierId: string;
  deliveredAt: string;
}
export const OrderDelivered = (
  orderId: string,
  payload: OrderDeliveredPayload
): DomainEvent<OrderDeliveredPayload> => createEvent('OrderDelivered', orderId, payload);
