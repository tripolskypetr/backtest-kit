import micro from "micro";
import Router from "router";
import finalhandler from "finalhandler";
import serveHandler from "serve-handler";

import health from "../routes/health";
import mock from "../routes/mock";
import view from "../routes/view";
import icon from "../routes/icon";
import dict from "../routes/dict";

import { CC_ENABLE_MOCK, CC_WWWROOT_PATH } from "./params";

import getPublicPath from "../helpers/getPublicPath";

const router = Router({
  params: true,
});

router.all("/api/v1/health/*", (req, res) => {
  return health(req, res, finalhandler(req, res));
});

router.all("/api/v1/mock/*", (req, res) => {
  return mock(req, res, finalhandler(req, res));
});

router.all("/api/v1/view/*", (req, res) => {
  return view(req, res, finalhandler(req, res));
});

router.all("/icon/*", (req, res) => {
  return icon(req, res, finalhandler(req, res));
});

router.all("/api/v1/dict/*", (req, res) => {
  return dict(req, res, finalhandler(req, res));
});

router.get("/*", (req, res) =>
  serveHandler(req, res, {
    public: CC_ENABLE_MOCK
      ? CC_WWWROOT_PATH || "./build/modules/frontend/build"
      : CC_WWWROOT_PATH || getPublicPath(),
  }),
);

export default micro.serve(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE");

  return router(req, res, finalhandler(req, res));
});
