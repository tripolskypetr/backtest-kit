import { NotificationModel as NotificationPayload } from "backtest-kit";

interface INotificationDto {
  backtest: boolean;
  notificationId: string;
  payload: NotificationPayload;
}

interface INotificationRow extends INotificationDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

export { INotificationDto, INotificationRow };
