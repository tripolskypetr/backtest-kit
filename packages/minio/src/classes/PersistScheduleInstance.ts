import { IScheduledSignalRow, IPersistScheduleInstance } from "backtest-kit";
import ioc from "../lib";
import { waitForInit } from "../utils/waitForInit";

export class PersistScheduleInstance implements IPersistScheduleInstance {
  constructor(
    readonly symbol: string,
    readonly strategyName: string,
    readonly exchangeName: string,
  ) {}
  async waitForInit(initial: boolean) {
    if (!initial) {
      return;
    }
    await waitForInit();
  }
  async readScheduleData(): Promise<IScheduledSignalRow | null> {
    const row = await ioc.scheduleDbService.findByContext(this.symbol, this.strategyName, this.exchangeName);
    return row ? row.payload : null;
  }
  async writeScheduleData(scheduleRow: IScheduledSignalRow | null): Promise<void> {
    await ioc.scheduleDbService.upsert(this.symbol, this.strategyName, this.exchangeName, scheduleRow);
  }
}

export default PersistScheduleInstance;
