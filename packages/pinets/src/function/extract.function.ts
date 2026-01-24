import lib from "../lib";
import {
  ExtractedData,
  PlotMapping,
} from "../lib/services/data/PineDataService";
import { PlotModel } from "../model/Plot.model";

const METHOD_NAME_RUN = "extract.extract";

export async function extract<M extends PlotMapping>(
  plots: PlotModel,
  mapping: M,
): Promise<ExtractedData<M>> {
  lib.loggerService.info(METHOD_NAME_RUN, {
    mapping,
  });
  return lib.pineDataService.extract(plots, mapping);
}
