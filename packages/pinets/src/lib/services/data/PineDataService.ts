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

export class PineDataService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public extract<M extends PlotMapping>(plots: PlotModel, mapping: M): ExtractedData<M> {
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
