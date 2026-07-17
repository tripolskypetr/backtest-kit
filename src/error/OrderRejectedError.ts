const ORDER_REJECTED_ERROR_TYPE = Symbol.for("OrderRejectedError");

const ERROR_MESSAGE_DEFAULT = "OrderRejectedError";

/**
 * Типизированная ошибка чтобы различить бизнес ошибку от кейса
 * когда интернет не работает из-за блокировок
 * 
 * Использовать в onOrderOpenCommit/onOrderCloseCommit если
 * покупатель не нашелся и продолжать попытки бесполезно
 */
export class OrderRejectedError extends Error {
  public readonly __type__ = ORDER_REJECTED_ERROR_TYPE;

  constructor(message = ERROR_MESSAGE_DEFAULT) {
    super(message);
    this.name = "OrderRejectedError";
  }

  static isOrderRejectedError(error: object): boolean {
    if (Reflect.get(error, "__type__") === ORDER_REJECTED_ERROR_TYPE) {
      return true;
    }
    return false;
  }
}

export default OrderRejectedError;
