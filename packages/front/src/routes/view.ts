import micro from "micro";
import Router from "router";

// @ts-ignore
import { ioc } from "src/lib";

const router = Router({
  params: true,
});

// ExchangeViewService endpoints
router.post("/api/v1/view/candles", async (req, res) => {
  const { signalId, interval } = <any>await micro.json(req);
  return await micro.send(
    res,
    200,
    await ioc.exchangeViewService.getCandles(signalId, interval)
  );
});

// NotificationViewService endpoints
router.post("/api/v1/view/notification", async (req, res) => {
  return await micro.send(
    res,
    200,
    await ioc.notificationViewService.getData()
  );
});

// StorageViewService endpoints
router.post("/api/v1/view/storage_one/:id", async (req, res) => {
  const signalId = req.params.id;
  return await micro.send(
    res,
    200,
    await ioc.storageViewService.findSignalById(signalId)
  );
});

router.post("/api/v1/view/storage_list/live", async (req, res) => {
  return await micro.send(
    res,
    200,
    await ioc.storageViewService.listSignalLive()
  );
});

router.post("/api/v1/view/storage_list/backtest", async (req, res) => {
  return await micro.send(
    res,
    200,
    await ioc.storageViewService.listSignalBacktest()
  );
});

export default router;
