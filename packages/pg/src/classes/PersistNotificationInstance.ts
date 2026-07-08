import { NotificationData, IPersistNotificationInstance } from "backtest-kit";
import ioc from "../lib";
import { waitForInit } from "../utils/waitForInit";

export class PersistNotificationInstance implements IPersistNotificationInstance {
  constructor(readonly backtest: boolean) {}
  async waitForInit(initial: boolean) {
    if (!initial) {
      return;
    }
    await waitForInit();
  }
  async readNotificationData(): Promise<NotificationData> {
    const rows = await ioc.notificationDbService.listByMode(this.backtest);
    return rows.map((row) => row.payload).reverse();
  }
  async writeNotificationData(notifications: NotificationData): Promise<void> {
    for (const notification of notifications) {
      await ioc.notificationDbService.upsert(this.backtest, notification.id, notification);
    }
  }
}

export default PersistNotificationInstance;
