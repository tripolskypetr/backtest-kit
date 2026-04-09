import http from "http";
import { singleshot } from "functools-kit";

import { CC_WWWROOT_HOST, CC_WWWROOT_PORT } from "../config/params";

import { serveSubject } from "../config/emitters";

import router from "../config/router";
import ioc from "../lib";

const METHOD_NAME_SERVE = "serve.serve";
const METHOD_NAME_GET_ROUTER = "serve.getRouter";

const MAX_CONNECTIONS = 1_000;
const SOCKET_TIMEOUT = 60 * 10 * 1000;

const serveInternal = singleshot(
  (host = CC_WWWROOT_HOST, port = CC_WWWROOT_PORT) => {
    const server = new http.Server(router);

    server.listen(port, host).addListener("listening", () => {
      console.log(`Listening on http://${host}:${port}`);
    });

    server.maxConnections = MAX_CONNECTIONS;
    server.setTimeout(SOCKET_TIMEOUT);

    return () => {
      server.close();
      serveInternal.clear();
    };
  },
);

export function serve(host?: string, port?: number, cwd = process.cwd()) {
  ioc.loggerService.log(METHOD_NAME_SERVE, {
    host,
    port,
  });
  serveSubject.next(cwd);
  return serveInternal(host, port);
}

export function getRouter() {
  ioc.loggerService.log(METHOD_NAME_GET_ROUTER);
  return router;
}
