import micro from "micro";
import Router from "router";

// @ts-ignore
import { ioc } from "src/lib";

const router = Router({
  params: true,
});

// ExchangeMockService endpoints
router.post("/api/v1/mock/candles", async (req, res) => {
  const { signalId, interval } = <any>await micro.json(req);
  return await micro.send(
    res,
    200,
    await ioc.exchangeMockService.getCandles(signalId, interval)
  );
});

// NotificationMockService endpoints
router.post("/api/v1/mock/notification", async (req, res) => {
  return await micro.send(
    res,
    200,
    await ioc.notificationMockService.getData()
  );
});

// StorageMockService endpoints
router.post("/api/v1/mock/storage_one/:id", async (req, res) => {
  const signalId = req.params.id;
  return await micro.send(
    res,
    200,
    await ioc.storageMockService.findSignalById(signalId)
  );
});

router.post("/api/v1/mock/storage_list/live", async (req, res) => {
  return await micro.send(
    res,
    200,
    await ioc.storageMockService.listSignalLive()
  );
});

router.post("/api/v1/mock/storage_list/backtest", async (req, res) => {
  return await micro.send(
    res,
    200,
    await ioc.storageMockService.listSignalBacktest()
  );
});

export default router;
