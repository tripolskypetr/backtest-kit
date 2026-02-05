import { PlotMapping } from "../lib/services/data/PineDataService";
import { PlotModel } from "../model/Plot.model";

import pine from "../lib";

const TO_MARKDOWN_METHOD_NAME = "markdown.toMarkdown";

type ResultId = string | number;

export async function toMarkdown<M extends PlotMapping>(
  signalId: ResultId,
  plots: PlotModel,
  mapping: M,
): Promise<string> {
  pine.loggerService.log(TO_MARKDOWN_METHOD_NAME, {
    signalId,
    plotCount: Object.keys(plots).length,
    mapping,
  });
  return await pine.pineMarkdownService.getReport(signalId, plots, mapping);
}
