import mongoose, { Document, Schema } from "mongoose";
import { NotificationModel as NotificationPayload } from "backtest-kit";

interface INotificationDto {
  backtest: boolean;
  notificationId: string;
  payload: NotificationPayload;
}

interface NotificationDocument extends INotificationDto, Document {}

interface INotificationRow extends INotificationDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

const NotificationSchema: Schema<NotificationDocument> = new Schema(
  {
    backtest: { type: Boolean, required: true, index: true },
    notificationId: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: { createdAt: "createDate", updatedAt: "updatedDate" }, minimize: false }
);

NotificationSchema.index({ backtest: 1, notificationId: 1 }, { unique: true });

NotificationSchema.index({ backtest: 1, createDate: -1 });

const NotificationModel = mongoose.model<NotificationDocument>("notification-items", NotificationSchema);

export { NotificationModel, INotificationDto, INotificationRow };
