import micro from "micro";
import Router from "router";
import { errorData, getErrorMessage } from "functools-kit";

import omit from "../utils/omit";

import { ioc } from "../lib";

const router = Router({
  params: true,
});

// ExplorerMockService endpoints

interface ExplorerTreeRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
}

interface ExplorerNodeRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
  path: string;
}

router.post("/api/v1/explorer_mock/tree", async (req, res) => {
  try {
    const request = <ExplorerTreeRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const data = await ioc.explorerMockService.getTree();
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/explorer_mock/tree ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/explorer_mock/tree error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/explorer_mock/node", async (req, res) => {
  try {
    const request = <ExplorerNodeRequest>await micro.json(req);
    const { requestId, serviceName, path } = request;
    const data = await ioc.explorerMockService.getNode(path);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/explorer_mock/node ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/explorer_mock/node error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

export default router;
