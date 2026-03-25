import lib from "../lib";
import {
  ExtractedData,
  ExtractedDataRow,
  PlotMapping,
} from "../lib/services/data/PineDataService";
import { PlotModel } from "../model/Plot.model";

const METHOD_NAME_EXTRACT = "extract.extract";
const METHOD_NAME_EXTRACT_ROWS = "extractRows.extractRows";

export async function extractRows<M extends PlotMapping>(
  plots: PlotModel,
  mapping: M,
): Promise<ExtractedDataRow<M>[]> {
  lib.loggerService.info(METHOD_NAME_EXTRACT_ROWS, {
    mapping,
  });
  return lib.pineDataService.extractRows(plots, mapping);
}

export async function extract<M extends PlotMapping>(
  plots: PlotModel,
  mapping: M,
): Promise<ExtractedData<M>> {
  lib.loggerService.info(METHOD_NAME_EXTRACT, {
    mapping,
  });
  return lib.pineDataService.extract(plots, mapping);
}
