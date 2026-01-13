import { memoize, ToolRegistry } from "functools-kit";
import { InferenceName } from "../../../enum/InferenceName";
import IProvider from "../../../interface/Provider.interface";
import { inject } from "../../core/di";
import { TContextService } from "../base/ContextService";
import { TYPES } from "../../core/types";
import {
  ISwarmCompletionArgs,
  IOutlineCompletionArgs,
  ISwarmMessage,
  IOutlineMessage,
} from "agent-swarm-kit";
import LoggerService from "../common/LoggerService";
import { ILogger } from "../../../interface/Logger.interface";

type RunnerClass = new (contextService: TContextService, logger: ILogger) => IProvider;

export class RunnerPrivateService implements IProvider {
  private readonly contextService = inject<TContextService>(
    TYPES.contextService
  );

  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private _registry = new ToolRegistry<Record<InferenceName, RunnerClass>>(
    "runner_registry"
  );

  private getRunner = memoize(
    ([inference]) => `${inference}`,
    (inference: InferenceName) => {
      const Runner = this._registry.get(inference);
      return new Runner(this.contextService, this.loggerService);
    }
  );

  public getCompletion = async (
    params: ISwarmCompletionArgs
  ): Promise<ISwarmMessage> => {
    this.loggerService.log("runnerPrivateService getCompletion");
    const runner = this.getRunner(this.contextService.context.inference);
    return await runner.getCompletion(params);
  };

  public getStreamCompletion = async (
    params: ISwarmCompletionArgs
  ): Promise<ISwarmMessage> => {
    this.loggerService.log("runnerPrivateService getStreamCompletion");
    const runner = this.getRunner(this.contextService.context.inference);
    return await runner.getStreamCompletion(params);
  };

  public getOutlineCompletion = async (
    params: IOutlineCompletionArgs
  ): Promise<IOutlineMessage> => {
    this.loggerService.log("runnerPrivateService getOutlineCompletion");
    const runner = this.getRunner(this.contextService.context.inference);
    return await runner.getOutlineCompletion(params);
  };

  public registerRunner = (name: InferenceName, runner: RunnerClass) => {
    this._registry = this._registry.register(name, runner);
  };
}

export default RunnerPrivateService;
