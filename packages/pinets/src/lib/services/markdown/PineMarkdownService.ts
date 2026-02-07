import { inject } from "../../core/di";
import { PlotModel } from "../../../model/Plot.model";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../core/types";
import { ExecutionContextService, Markdown, MarkdownName, MethodContextService, lib } from "backtest-kit";
import { PlotExtractConfig, PlotMapping } from "../data/PineDataService";

const TABLE_ROWS_LIMIT = 48;

const GET_METHOD_CONTEXT_FN = () => {
  if (MethodContextService.hasContext()) {
    const { exchangeName, frameName, strategyName } = lib.methodContextService.context;
    return { exchangeName, frameName, strategyName };
  }
  return {
    strategyName: "",
    exchangeName: "",
    frameName: "",
  };
};

const GET_EXECUTION_CONTEXT_FN = () => {
  if (ExecutionContextService.hasContext()) {
    const { when } = lib.executionContextService.context;
    return { when: when.toISOString() };
  }
  return {
    when: "",
  };
};

type ResultId = string | number;

interface IPlotRow {
  time: number;
  [key: string]: number | null;
}

function getPlotName(config: string | PlotExtractConfig<any>): string {
  return typeof config === "string" ? config : config.plot;
}

function isSafe(value: unknown): value is number {
  return typeof value === "number" && !isNaN(value) && isFinite(value);
}

const DEFAULT_FORMAT = (v: number | null): string =>
  v !== null ? Number(v).toFixed(4) : "N/A";

function generateMarkdownTable(
  rows: IPlotRow[],
  keys: string[],
  signalId: ResultId,
): string {
  const { when: createdAt } = GET_EXECUTION_CONTEXT_FN();

  let markdown = `# PineScript Technical Analysis Dump\n\n`;
  markdown += `**Signal ID**: ${String(signalId)}\n`;

  if (createdAt) {
    markdown += `**Current datetime**: ${String(createdAt)}\n`;
  }

  markdown += "\n";
  markdown += `| ${keys.join(" | ")} | timestamp |\n`;
  markdown += `| --- | ${keys.map(() => "---").join(" | ")} |\n`;

  for (const row of rows) {
    const timestamp = new Date(row.time).toISOString();
    const cells = keys.map((key) => DEFAULT_FORMAT(row[key] as number | null));
    markdown += `| ${cells.join(" | ")} | ${timestamp} |\n`;
  }

  return markdown;
}

export class PineMarkdownService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public getData = <M extends PlotMapping>(plots: PlotModel, mapping: M, limit = TABLE_ROWS_LIMIT): IPlotRow[] => {
    this.loggerService.log("pineMarkdownService getData", {
      plotCount: Object.keys(plots).length,
    });

    const entries = Object.entries(mapping);
    if (entries.length === 0) {
      return [];
    }

    const plotNames = entries.map(([key, config]) => ({ key, plotName: getPlotName(config) }));
    const dataLength = Math.max(...plotNames.map(({ plotName }) => plots[plotName]?.data?.length ?? 0));

    if (dataLength === 0) {
      return [];
    }

    const rows: IPlotRow[] = [];
    for (let i = 0; i < dataLength; i++) {
      let time: number | null = null;
      const row: IPlotRow = { time: 0 };

      for (const { key, plotName } of plotNames) {
        const point = plots[plotName]?.data?.[i];
        if (time === null && point) {
          time = point.time;
        }
        row[key] = isSafe(point?.value) ? point.value : null;
      }

      if (time !== null) {
        row.time = time;
        rows.push(row);
      }
    }

    return rows.slice(-limit);
  };

  public getReport = <M extends PlotMapping>(signalId: ResultId, plots: PlotModel, mapping: M, limit = TABLE_ROWS_LIMIT) => {
    this.loggerService.log("pineMarkdownService getReport", {
      signalId,
      plotCount: Object.keys(plots).length,
    });
    const keys = Object.keys(mapping);
    const rows = this.getData(plots, mapping, limit);
    return generateMarkdownTable(rows, keys, signalId);
  };

  public dump = async <M extends PlotMapping>(
    signalId: ResultId,
    plots: PlotModel,
    mapping: M,
    taName: string,
    outputDir = `./dump/ta/${taName}`,
  ): Promise<void> => {
    this.loggerService.log("pineMarkdownService dumpSignal", {
      signalId,
      plotCount: Object.keys(plots).length,
      outputDir,
    });

    const content = this.getReport(signalId, plots, mapping);

    const { exchangeName, frameName, strategyName } = GET_METHOD_CONTEXT_FN();

    await Markdown.writeData(<MarkdownName>taName, content, {
      path: outputDir,
      file: `${String(signalId)}.md`,
      symbol: "",
      signalId: String(signalId),
      strategyName,
      exchangeName,
      frameName,
    });
  };
}

export default PineMarkdownService;
