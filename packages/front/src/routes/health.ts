import micro from "micro";
import os from "os";

import Router from "router";

const router = Router({
  params: true,
});

router.get("/api/v1/health/health_check", async (req, res) => {
  const [cpuLoad] = os.loadavg();
  return await micro.send(res, 200, {
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    cpuLoad,
    pid: process.pid,
  });
});

export default router;
