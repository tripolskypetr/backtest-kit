import { PlotRecord } from "../model/Plot.model";
import { IProvider } from "./Provider.interface";

export type TPineCtor = (source: IProvider, tickerId: string, timeframe: string, limit: number) => IPine; 

export interface IPine {
    ready(): Promise<void>;
    run(code: string): Promise<PlotRecord>
}
