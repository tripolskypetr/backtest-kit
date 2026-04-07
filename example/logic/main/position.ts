import { json } from "agent-swarm-kit";
import { OutlineName } from "../enum/OutlineName";
import { ResearchResponseContract } from "../contract/ResearchResponse.contract";
import { PositionResponseContract } from "../contract/PositionResponse.contract";

const position = async (
  research: ResearchResponseContract,
  symbol: string,
  when: Date,
) => {
  const response = await json<PositionResponseContract>(
    OutlineName.PositionOutline,
    research,
    symbol,
    when,
  );
  if (!response.data) {
    throw new Error("Position failed");
  }
  return { id: response.resultId, ...response.data };
};

export { position };
