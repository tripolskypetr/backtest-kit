import "./core/provide";

import { init, inject } from "./core/di";
import { TYPES } from "./core/types";
import { TContextService } from "./services/base/ContextService";
import RunnerPrivateService from "./services/private/RunnerPrivateService";
import RunnerPublicService from "./services/public/RunnerPublicService";
import { InferenceName } from "../enum/InferenceName";
import GrokProvider from "../client/GrokProvider.client";
import HfProvider from "../client/HfProvider.client";
import OllamaProvider from "../client/OllamaProvider.client";
import ClaudeProvider from "../client/ClaudeProvider.client";
import GPT5Provider from "../client/GPT5Provider.client";
import DeepseekProvider from "../client/DeepseekProvider.client";
import MistralProvider from "../client/MistralProvider.client";
import PerplexityProvider from "../client/PerplexityProvider.client";
import CohereProvider from "../client/CohereProvider.client";
import AlibabaProvider from "../client/AlibabaProvider.client";
import LoggerService from "./services/common/LoggerService";

const commonServices = {
  loggerService: inject<LoggerService>(TYPES.loggerService),
}

const baseServices = {
  contextService: inject<TContextService>(TYPES.contextService),
};

const privateServices = {
  runnerPrivateService: inject<RunnerPrivateService>(
    TYPES.runnerPrivateService
  ),
};

const publicServices = {
  runnerPublicService: inject<RunnerPublicService>(TYPES.runnerPublicService),
};

const engine = {
  ...commonServices,
  ...baseServices,
  ...privateServices,
  ...publicServices,
};

init();

{
  engine.runnerPrivateService.registerRunner(
    InferenceName.OllamaInference,
    OllamaProvider
  );
  engine.runnerPrivateService.registerRunner(
    InferenceName.GrokInference,
    GrokProvider
  );
  engine.runnerPrivateService.registerRunner(
    InferenceName.HfInference,
    HfProvider
  );
  engine.runnerPrivateService.registerRunner(
    InferenceName.ClaudeInference,
    ClaudeProvider
  );
  engine.runnerPrivateService.registerRunner(
    InferenceName.GPT5Inference,
    GPT5Provider
  );
  engine.runnerPrivateService.registerRunner(
    InferenceName.DeepseekInference,
    DeepseekProvider
  );
  engine.runnerPrivateService.registerRunner(
    InferenceName.MistralInference,
    MistralProvider
  );
  engine.runnerPrivateService.registerRunner(
    InferenceName.PerplexityInference,
    PerplexityProvider
  );
  engine.runnerPrivateService.registerRunner(
    InferenceName.CohereInference,
    CohereProvider
  );
  engine.runnerPrivateService.registerRunner(
    InferenceName.AlibabaInference,
    AlibabaProvider
  );
}

export { engine };

Object.assign(globalThis, { engine });

export default engine;
