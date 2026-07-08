import { RiskData, IPersistRiskInstance } from "backtest-kit";
import ioc from "../lib";
import { waitForInit } from "../utils/waitForInit";

export class PersistRiskInstance implements IPersistRiskInstance {
  constructor(
    readonly riskName: string,
    readonly exchangeName: string,
  ) {}
  async waitForInit(initial: boolean) {
    if (!initial) {
      return;
    }
    await waitForInit();
  }
  async readPositionData(_when: Date): Promise<RiskData> {
    const row = await ioc.riskDbService.findByContext(this.riskName, this.exchangeName);
    return row ? row.positions : [];
  }
  async writePositionData(positions: RiskData, when: Date): Promise<void> {
    await ioc.riskDbService.upsert(this.riskName, this.exchangeName, positions, when);
  }
}

export default PersistRiskInstance;
