import ContextService from "../services/base/ContextService";
import LoggerService from "../services/common/LoggerService";
import RunnerPrivateService from "../services/private/RunnerPrivateService";
import RunnerPublicService from "../services/public/RunnerPublicService";
import { provide } from "./di";
import { TYPES } from "./types";

{
  provide(TYPES.loggerService, () => new LoggerService());
}

{
  provide(TYPES.contextService, () => new ContextService());
}

{
  provide(TYPES.runnerPrivateService, () => new RunnerPrivateService());
}

{
  provide(TYPES.runnerPublicService, () => new RunnerPublicService());
}
