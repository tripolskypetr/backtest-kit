import {
  ISwarmCompletionArgs,
  IOutlineCompletionArgs,
  ISwarmMessage,
  IOutlineMessage,
} from "agent-swarm-kit";
import ContextService, { IContext } from "../base/ContextService";
import { inject } from "../../core/di";
import RunnerPrivateService from "../private/RunnerPrivateService";
import { TYPES } from "../../core/types";
import LoggerService from "../common/LoggerService";

export class RunnerPublicService {
  private readonly runnerPrivateService = inject<RunnerPrivateService>(
    TYPES.runnerPrivateService
  );

  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public getCompletion = async (
    params: ISwarmCompletionArgs,
    context: IContext
  ): Promise<ISwarmMessage> => {
    this.loggerService.log("runnerPublicService getCompletion");
    return await ContextService.runInContext(async () => {
      return await this.runnerPrivateService.getCompletion(params);
    }, context);
  };

  public getStreamCompletion = async (
    params: ISwarmCompletionArgs,
    context: IContext
  ): Promise<ISwarmMessage> => {
    this.loggerService.log("runnerPublicService getStreamCompletion");
    return await ContextService.runInContext(async () => {
      return await this.runnerPrivateService.getStreamCompletion(params);
    }, context);
  };

  public getOutlineCompletion = async (
    params: IOutlineCompletionArgs,
    context: IContext
  ): Promise<IOutlineMessage> => {
    this.loggerService.log("runnerPublicService getOutlineCompletion");
    return await ContextService.runInContext(async () => {
      return await this.runnerPrivateService.getOutlineCompletion(params);
    }, context);
  };
}

export default RunnerPublicService;
