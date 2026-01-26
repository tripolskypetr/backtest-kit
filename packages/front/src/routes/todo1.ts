import micro from "micro";

import Router from "router";

// @ts-ignore
import { ioc } from "src/lib";

const router = Router({
  params: true
});

router.post("/api/v1/todo1", async (req, res) => {
  const { data } = <any>await micro.json(req);
  return await micro.send(
    res,
    200,
    await ioc.todo1DbService.create(data)
  );
});

export default router;
