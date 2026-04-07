import { json } from "agent-swarm-kit";
import { OutlineName } from "../enum/OutlineName";
import { ResearchResponseContract } from "../contract/ResearchResponse.contract";

const research = async (symbol: string, when: Date) => {
    const response = await json<ResearchResponseContract>(OutlineName.ResearchOutline, symbol, when);
    if (!response.data) {
        throw new Error("Research failed");
    }
    return { id: response.resultId, ...response.data };
}

export { research };
