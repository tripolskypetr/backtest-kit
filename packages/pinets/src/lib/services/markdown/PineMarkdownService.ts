import { inject } from "../../core/di";
import { PlotModel } from "../../../model/Plot.model";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../core/types";
import { ExecutionContextService, Markdown, MarkdownName, MethodContextService, lib } from "backtest-kit";

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

const DEFAULT_FORMAT = (v: number | null): string =>
  v !== null ? Number(v).toFixed(4) : "N/A";

function isUnsafe(value: number | null): boolean {
  if (value === null) return true;
  if (typeof value !== "number") return true;
  if (isNaN(value)) return true;
  if (!isFinite(value)) return true;
  return false;
}

function extractRowAtIndex(
  plots: PlotModel,
  keys: string[],
  index: number,
): IPlotRow | null {
  let time: number | null = null;
  for (const key of keys) {
    const plotData = plots[key]?.data;
    if (plotData && plotData[index]) {
      time = plotData[index].time;
      break;
    }
  }

  if (time === null) return null;

  const row: IPlotRow = { time };

  for (const key of keys) {
    const plotData = plots[key]?.data;
    if (plotData && plotData[index]) {
      const value = plotData[index].value;
      row[key] = isUnsafe(value) ? null : value;
    } else {
      row[key] = null;
    }
  }

  return row;
}

function isRowWarmedUp(row: IPlotRow, keys: string[]): boolean {
  for (const key of keys) {
    if (!row[key]) {
      return false;
    }
  }
  return true;
}

function generateMarkdownTable(
  rows: IPlotRow[],
  keys: string[],
  signalId: ResultId,
): string {
  let markdown = "";

  const { when: createdAt } = GET_EXECUTION_CONTEXT_FN();

  markdown += `# PineScript Technical Analysis Dump\n\n`;
  markdown += `**Signal ID**: ${String(signalId)}\n`;

  if (createdAt) {
    markdown += `**Current datetime**: ${String(createdAt)}\n`;
  }

  markdown += "\n";

  const header = `| Timestamp | ${keys.join(" | ")} |\n`;
  const separator = `| --- | ${keys.map(() => "---").join(" | ")} |\n`;

  markdown += header;
  markdown += separator;

  for (const row of rows) {
    const timestamp = new Date(row.time).toISOString();
    const cells = keys.map((key) => DEFAULT_FORMAT(row[key] as number | null));
    markdown += `| ${timestamp} | ${cells.join(" | ")} |\n`;
  }

  return markdown;
}

export class PineMarkdownService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public getData = (plots: PlotModel) => {
    this.loggerService.log("pineMarkdownService getReport", {
      plotCount: Object.keys(plots).length,
    });
    const keys = Object.keys(plots);

    if (keys.length === 0) {
      return [];
    }

    const firstPlot = plots[keys[0]];
    const dataLength = firstPlot?.data?.length ?? 0;

    if (dataLength === 0) {
      return [];
    }

    const rows: IPlotRow[] = [];
    let warmupComplete = false;

    for (let i = 0; i < dataLength; i++) {
      const row = extractRowAtIndex(plots, keys, i);
      if (!row) continue;

      if (!warmupComplete) {
        if (isRowWarmedUp(row, keys)) {
          warmupComplete = true;
        } else {
          continue;
        }
      }

      rows.push(row);
    }

    return rows.slice(-TABLE_ROWS_LIMIT);
  };

  public getReport = (signalId: ResultId, plots: PlotModel) => {
    this.loggerService.log("pineMarkdownService getReport", {
      signalId,
      plotCount: Object.keys(plots).length,
    });
    const rows = this.getData(plots);
    const keys = Object.keys(plots);
    return generateMarkdownTable(rows, keys, signalId);
  };

  public dump = async (
    signalId: ResultId,
    plots: PlotModel,
    taName: string,
    outputDir = `./dump/ta/${taName}`,
  ): Promise<void> => {
    this.loggerService.log("pineMarkdownService dumpSignal", {
      signalId,
      plotCount: Object.keys(plots).length,
      outputDir,
    });

    const content = this.getReport(signalId, plots);

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
