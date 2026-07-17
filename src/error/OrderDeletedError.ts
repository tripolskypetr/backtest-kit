const ORDER_Deleted_ERROR_TYPE = Symbol.for("OrderDeletedError");

const ERROR_MESSAGE_DEFAULT = "OrderDeletedError";

/**
 * Типизированная ошибка чтобы различить сетевую ошибку от кейса
 * когда интернет не работает из-за блокировок
 * 
 * Использовать в onOrderActiveCheck/onOrderScheduleCheck когда
 * пользователь удалил ордер руками
 */
export class OrderDeletedError extends Error {
  public readonly __type__ = ORDER_Deleted_ERROR_TYPE;

  constructor(message = ERROR_MESSAGE_DEFAULT) {
    super(message);
    this.name = "OrderDeletedError";
  }

  static isOrderDeletedError(error: object): boolean {
    if (Reflect.get(error, "__type__") === ORDER_Deleted_ERROR_TYPE) {
      return true;
    }
    return false;
  }
}

export default OrderDeletedError;
