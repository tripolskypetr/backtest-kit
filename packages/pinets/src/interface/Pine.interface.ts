import { PlotRecord } from "../model/Plot.model";
import { IIndicator } from "./Indicator.interface";
import { IProvider } from "./Provider.interface";

export type TPineCtor = (source: IProvider, tickerId: string, timeframe: string, limit: number) => IPine; 

export interface IPine {
    ready(): Promise<void>;
    run(code: string | IIndicator): Promise<PlotRecord>
}
