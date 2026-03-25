import { inject } from "../../core/di";
import { PlotModel } from "../../../model/Plot.model";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../core/types";

export type PlotExtractConfig<T = number> = {
  plot: string;
  barsBack?: number;
  transform?: (value: number) => T;
};

export type PlotMapping = {
  [key: string]: string | PlotExtractConfig<any>;
};

// Выводит тип результата из маппинга
export type ExtractedData<M extends PlotMapping> = {
  [K in keyof M]: M[K] extends PlotExtractConfig<infer R>
    ? R
    : M[K] extends string
      ? number
      : never;
};

export type ExtractedDataRow<M extends PlotMapping> = {
  [K in keyof M]: M[K] extends PlotExtractConfig<infer R>
    ? R | null
    : M[K] extends string
      ? number | null
      : never;
} & { timestamp: string };


const GET_VALUE_FN = (
  plots: PlotModel,
  name: string,
  barsBack: number = 0,
): number => {
  const data = plots[name]?.data;
  if (!data || data.length === 0) return 0;
  const idx = data.length - 1 - barsBack;
  return idx >= 0 ? (data[idx]?.value ?? 0) : 0;
};

const GET_VALUE_AT_FN = (
  plots: PlotModel,
  name: string,
  i: number,
  barsBack: number = 0,
): number | null => {
  const data = plots[name]?.data;
  if (!data) return null;
  const idx = i - barsBack;
  return idx >= 0 ? (data[idx]?.value ?? null) : null;
};

export class PineDataService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public extractRows<M extends PlotMapping>(
    plots: PlotModel,
    mapping: M,
  ): ExtractedDataRow<M>[] {
    this.loggerService.log("pineDataService extractRows", {
      plotCount: Object.keys(plots).length,
      mapping,
    });
    const entries = Object.entries(mapping) as [
      keyof M & string,
      string | PlotExtractConfig<any>,
    ][];
    const plotNames = entries.map(([, config]) =>
      typeof config === "string" ? config : config.plot,
    );
    const dataLength = Math.max(
      ...plotNames.map((name) => plots[name]?.data?.length ?? 0),
    );
    const rows: ExtractedDataRow<M>[] = [];
    for (let i = 0; i < dataLength; i++) {
      const row = {} as ExtractedDataRow<M>;
      for (const [key, config] of entries) {
        if (typeof config === "string") {
          row[key] = GET_VALUE_AT_FN(
            plots,
            config,
            i,
          ) as ExtractedDataRow<M>[typeof key];
        } else {
          const raw = GET_VALUE_AT_FN(
            plots,
            config.plot,
            i,
            config.barsBack ?? 0,
          );
          row[key] = (
            raw !== null && config.transform ? config.transform(raw) : raw
          ) as ExtractedDataRow<M>[typeof key];
        }
      }
      const firstPlot = plots[plotNames[0]]?.data?.[i];
      row.timestamp = firstPlot?.time
        ? new Date(firstPlot.time).toISOString()
        : "";
      rows.push(row);
    }
    return rows;
  }

  public extract<M extends PlotMapping>(
    plots: PlotModel,
    mapping: M,
  ): ExtractedData<M> {
    this.loggerService.log("pineDataService extract", {
      plotCount: Object.keys(plots).length,
      mapping,
    });

    const result = {} as ExtractedData<M>;

    for (const key in mapping) {
      const config = mapping[key];

      if (typeof config === "string") {
        Object.assign(result, { [key]: GET_VALUE_FN(plots, config) });
      } else {
        const value = GET_VALUE_FN(plots, config.plot, config.barsBack ?? 0);
        Object.assign(result, {
          [key]: config.transform ? config.transform(value) : value,
        });
      }
    }

    return result;
  }
}

export default PineDataService;
