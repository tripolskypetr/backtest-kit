import {
  addCompletion,
  IOutlineCompletionArgs,
} from "agent-swarm-kit";
import { CompletionName } from "../../enum/CompletionName";
import { engine } from "../../lib";

addCompletion({
  completionName: CompletionName.RunnerOutlineCompletion,
  getCompletion: async (params: IOutlineCompletionArgs) => {
    return await engine.runnerPrivateService.getOutlineCompletion(params);
  },
  json: true,
});
