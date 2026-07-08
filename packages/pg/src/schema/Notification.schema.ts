import { EntitySchema } from "typeorm";
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

const NotificationModel = new EntitySchema<INotificationRow>({
  name: "notification-items",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    backtest: { type: "boolean" },
    notificationId: { type: String },
    payload: { type: "jsonb" },
    createDate: { type: "timestamptz", createDate: true },
    updatedDate: { type: "timestamptz", updateDate: true },
  },
  indices: [
    {
      name: "notification_items_uq",
      columns: ["backtest", "notificationId"],
      unique: true,
    },
  ],
});

export { NotificationModel, INotificationDto, INotificationRow };
