import micro from "micro";
import http from "http";
import Router from "router";
import finalhandler from "finalhandler";
import serveHandler from "serve-handler";

import health from './routes/health';

const router = Router({
  params: true
});

router.all("/api/v1/health/*", (req, res) => {
  return health(
    req,
    res,
    finalhandler(req, res),
  );
});

router.get("/*", (req, res) => serveHandler(req, res, {
  public: "./public",
}));

const server = new http.Server(
  micro.serve(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE");

    return router(
      req,
      res,
      finalhandler(req, res),
    );
  })
);

server.listen(80);

console.log("Server listening on http://localhost:80")
