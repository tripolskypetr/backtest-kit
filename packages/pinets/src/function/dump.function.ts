import { PlotMapping } from "../lib/services/data/PineDataService";
import { PlotModel } from "../model/Plot.model";

import pine from "../lib";

const DUMP_SIGNAL_METHOD_NAME = "dump.dumpSignal";

type ResultId = string | number;

export async function dumpPlotData<M extends PlotMapping>(
  signalId: ResultId,
  plots: PlotModel,
  mapping: M,
  taName: string,
  outputDir = `./dump/ta/${taName}`,
): Promise<void> {
  pine.loggerService.log(DUMP_SIGNAL_METHOD_NAME, {
    signalId,
    plotCount: Object.keys(plots).length,
    mapping,
    outputDir,
  });
  return await pine.pineMarkdownService.dump(signalId, plots, mapping, taName, outputDir);
}
