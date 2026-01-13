import { ISwarmCompletionArgs, IOutlineCompletionArgs, ISwarmMessage, IOutlineMessage } from "agent-swarm-kit";

export interface IProvider {
  getCompletion(params: ISwarmCompletionArgs): Promise<ISwarmMessage>;
  getStreamCompletion(params: ISwarmCompletionArgs): Promise<ISwarmMessage>;
  getOutlineCompletion(params: IOutlineCompletionArgs): Promise<IOutlineMessage>;
}

export default IProvider;
