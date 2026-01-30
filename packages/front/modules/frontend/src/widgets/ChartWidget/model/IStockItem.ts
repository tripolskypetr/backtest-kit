import { UTCTimestamp } from "lightweight-charts";

export interface IStockItem {
    time: UTCTimestamp;
    open: number;
    high: number;
    low: number;
    close: number;
}

export default IStockItem;
