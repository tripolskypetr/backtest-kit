import { IOutlineMessage, ISwarmCompletionArgs, ISwarmMessage, IOutlineCompletionArgs } from 'agent-swarm-kit';
import * as di_scoped from 'di-scoped';

declare const ollama: (messages: IOutlineMessage[], model: string, apiKey?: string | string[]) => Promise<{
    id: string;
    position: "long" | "short";
    minuteEstimatedTime: number;
    priceStopLoss: number;
    priceTakeProfit: number;
    note: string;
    priceOpen: number;
}>;
declare const grok: (messages: IOutlineMessage[], model: string, apiKey?: string | string[]) => Promise<{
    id: string;
    position: "long" | "short";
    minuteEstimatedTime: number;
    priceStopLoss: number;
    priceTakeProfit: number;
    note: string;
    priceOpen: number;
}>;
declare const hf: (messages: IOutlineMessage[], model: string, apiKey?: string | string[]) => Promise<{
    id: string;
    position: "long" | "short";
    minuteEstimatedTime: number;
    priceStopLoss: number;
    priceTakeProfit: number;
    note: string;
    priceOpen: number;
}>;
declare const claude: (messages: IOutlineMessage[], model: string, apiKey?: string | string[]) => Promise<{
    id: string;
    position: "long" | "short";
    minuteEstimatedTime: number;
    priceStopLoss: number;
    priceTakeProfit: number;
    note: string;
    priceOpen: number;
}>;
declare const gpt5: (messages: IOutlineMessage[], model: string, apiKey?: string | string[]) => Promise<{
    id: string;
    position: "long" | "short";
    minuteEstimatedTime: number;
    priceStopLoss: number;
    priceTakeProfit: number;
    note: string;
    priceOpen: number;
}>;
declare const deepseek: (messages: IOutlineMessage[], model: string, apiKey?: string | string[]) => Promise<{
    id: string;
    position: "long" | "short";
    minuteEstimatedTime: number;
    priceStopLoss: number;
    priceTakeProfit: number;
    note: string;
    priceOpen: number;
}>;
declare const mistral: (messages: IOutlineMessage[], model: string, apiKey?: string | string[]) => Promise<{
    id: string;
    position: "long" | "short";
    minuteEstimatedTime: number;
    priceStopLoss: number;
    priceTakeProfit: number;
    note: string;
    priceOpen: number;
}>;
declare const perplexity: (messages: IOutlineMessage[], model: string, apiKey?: string | string[]) => Promise<{
    id: string;
    position: "long" | "short";
    minuteEstimatedTime: number;
    priceStopLoss: number;
    priceTakeProfit: number;
    note: string;
    priceOpen: number;
}>;
declare const cohere: (messages: IOutlineMessage[], model: string, apiKey?: string | string[]) => Promise<{
    id: string;
    position: "long" | "short";
    minuteEstimatedTime: number;
    priceStopLoss: number;
    priceTakeProfit: number;
    note: string;
    priceOpen: number;
}>;
declare const alibaba: (messages: IOutlineMessage[], model: string, apiKey?: string | string[]) => Promise<{
    id: string;
    position: "long" | "short";
    minuteEstimatedTime: number;
    priceStopLoss: number;
    priceTakeProfit: number;
    note: string;
    priceOpen: number;
}>;

interface ILogger {
    log(topic: string, ...args: any[]): void;
    debug(topic: string, ...args: any[]): void;
    info(topic: string, ...args: any[]): void;
    warn(topic: string, ...args: any[]): void;
}

declare const setLogger: (logger: ILogger) => void;

declare enum InferenceName {
    OllamaInference = "ollama_inference",
    GrokInference = "grok_inference",
    HfInference = "hf_inference",
    ClaudeInference = "claude_inference",
    GPT5Inference = "gpt5_inference",
    DeepseekInference = "deepseek_inference",
    MistralInference = "mistral_inference",
    PerplexityInference = "perplexity_inference",
    CohereInference = "cohere_inference",
    AlibabaInference = "alibaba_inference"
}

interface IContext {
    inference: InferenceName;
    model: string;
    apiKey: string | string[];
}
declare const ContextService: (new () => {
    readonly context: IContext;
}) & Omit<{
    new (context: IContext): {
        readonly context: IContext;
    };
}, "prototype"> & di_scoped.IScopedClassRun<[context: IContext]>;
type TContextService = InstanceType<typeof ContextService>;

interface IProvider {
    getCompletion(params: ISwarmCompletionArgs): Promise<ISwarmMessage>;
    getStreamCompletion(params: ISwarmCompletionArgs): Promise<ISwarmMessage>;
    getOutlineCompletion(params: IOutlineCompletionArgs): Promise<IOutlineMessage>;
}

type RunnerClass = new (contextService: TContextService, logger: ILogger) => IProvider;
declare class RunnerPrivateService implements IProvider {
    private readonly contextService;
    private readonly loggerService;
    private _registry;
    private getRunner;
    getCompletion: (params: ISwarmCompletionArgs) => Promise<ISwarmMessage>;
    getStreamCompletion: (params: ISwarmCompletionArgs) => Promise<ISwarmMessage>;
    getOutlineCompletion: (params: IOutlineCompletionArgs) => Promise<IOutlineMessage>;
    registerRunner: (name: InferenceName, runner: RunnerClass) => void;
}

declare class RunnerPublicService {
    private readonly runnerPrivateService;
    private readonly loggerService;
    getCompletion: (params: ISwarmCompletionArgs, context: IContext) => Promise<ISwarmMessage>;
    getStreamCompletion: (params: ISwarmCompletionArgs, context: IContext) => Promise<ISwarmMessage>;
    getOutlineCompletion: (params: IOutlineCompletionArgs, context: IContext) => Promise<IOutlineMessage>;
}

declare class LoggerService implements ILogger {
    private _commonLogger;
    log: (topic: string, ...args: any[]) => Promise<void>;
    debug: (topic: string, ...args: any[]) => Promise<void>;
    info: (topic: string, ...args: any[]) => Promise<void>;
    warn: (topic: string, ...args: any[]) => Promise<void>;
    setLogger: (logger: ILogger) => void;
}

declare class OutlinePrivateService {
    private readonly loggerService;
    getCompletion: (messages: IOutlineMessage[]) => Promise<{
        id: string;
        position: "long" | "short";
        minuteEstimatedTime: number;
        priceStopLoss: number;
        priceTakeProfit: number;
        note: string;
        priceOpen: number;
    }>;
}

declare class OutlinePublicService {
    private readonly loggerService;
    private readonly outlinePrivateService;
    getCompletion: (messages: IOutlineMessage[], inference: InferenceName, model: string, apiKey?: string | string[]) => Promise<{
        id: string;
        position: "long" | "short";
        minuteEstimatedTime: number;
        priceStopLoss: number;
        priceTakeProfit: number;
        note: string;
        priceOpen: number;
    }>;
}

declare const engine: {
    runnerPublicService: RunnerPublicService;
    outlinePublicService: OutlinePublicService;
    runnerPrivateService: RunnerPrivateService;
    outlinePrivateService: OutlinePrivateService;
    contextService: {
        readonly context: IContext;
    };
    loggerService: LoggerService;
};

export { alibaba, claude, cohere, deepseek, gpt5, grok, hf, engine as lib, mistral, ollama, perplexity, setLogger };
