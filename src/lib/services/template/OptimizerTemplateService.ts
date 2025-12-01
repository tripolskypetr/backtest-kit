import { inject } from "../../../lib/core/di";
import {
  IOptimizerData,
  IOptimizerTemplate,
} from "../../../interfaces/Optimizer.interface";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { str } from "functools-kit";

import { Ollama } from "ollama";

export class OptimizerTemplateService implements IOptimizerTemplate {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public getUserMessage = async (
    symbol: string,
    data: IOptimizerData[],
    name: string
  ) => {
    this.loggerService.log("optimizerTemplateService getUserMessage", {
      symbol,
      data,
      name,
    });
    return str.newline("Прочитай данные и скажи ОК", "", JSON.stringify(data));
  };

  public getAssistantMessage = async (
    symbol: string,
    data: IOptimizerData[],
    name: string
  ) => {
    this.loggerService.log("optimizerTemplateService getAssistantMessage", {
      symbol,
      data,
      name,
    });
    return "ОК";
  };

  public getTextTemplate = async () => {
    this.loggerService.log("optimizerTemplateService getTextTemplate");
    return str.newline(
      `export async function text(messages) {`,
      `    const ollama = new Ollama({`,
      `        host: "https://ollama.com",`,
      `        headers: {`,
      `            Authorization: \`Bearer \${process.env.OLLAMA_API_KEY}\`,`,
      `        },`,
      `    });`,
      ``,
      `    const response = await ollama.chat({`,
      `        model: "gpt-oss:20b",`,
      `        messages: [`,
      `            {`,
      `                role: "system",`,
      `                content: [`,
      `                    "В ответ напиши торговую стратегию где нет ничего лишнего,",`,
      `                    "только отчёт готовый для копипасты целиком",`,
      `                    "",`,
      `                    "**ВАЖНО**: Не здоровайся, не говори что делаешь - только отчёт!"`,
      `                ].join("\\n"),`,
      `            },`,
      `            ...messages,`,
      `        ],`,
      `    });`,
      ``,
      `    return response.message.content.trim();`,
      `}`
    );
  };
}

export default OptimizerTemplateService;
