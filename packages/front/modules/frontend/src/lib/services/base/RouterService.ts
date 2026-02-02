import { Action, Blocker, BrowserHistory, Listener, State, To } from "history";

import {
  Source,
  Subject,
  createManagedHistory,
  createSsManager,
  createWindowHistory,
  singleshot,
} from "react-declarative";
import {
  CC_FORCE_BROWSER_HISTORY,
} from "../../../config/params";

const basePathSet = new Set<string>([
  "/error_page",
  "/offline_page",
  "/dashboard",
]);

const browserHistory = CC_FORCE_BROWSER_HISTORY
  ? createWindowHistory()
  : createManagedHistory("router-service-path", {
      allowed: (path) => {
        return !basePathSet.has(path);
      },
      map: (path) => {
        if (basePathSet.has(path)) {
          return "/";
        }
        return path;
      },
    }); 

interface Location {
  hash: string;
  key: string;
  pathname: string;
  search: string;
  state: any;
}

const DEFAULT_PATH = "/";

const ALLOWED_BACK_PATH = new Set([
  "/dashboard",
]);

const lastBasePathManager = createSsManager<string>("router-service_lastBasePath");

export class RouterService implements BrowserHistory {
  public readonly reloadSubject = new Subject<void>();

  location: Location = browserHistory.location;

  action: Action = browserHistory.action;

  get lastBasePath() {
    return lastBasePathManager.getValue();
  }

  set lastBasePath(value: string | null) {
    lastBasePathManager.setValue(value);
  }

  subscribeLeave = (fn: () => void) => {
    return Source.create<void>((next) =>
      this.listen(({ action }) => {
        if (action === "PUSH") {
          next();
        }
      }),
    ).once(fn);
  };

  get locationState() {
    if (this.location.state) {
      return this.location.state;
    }
    return {};
  }

  get path() {
    return this.location?.pathname || DEFAULT_PATH;
  }

  pushPreviousPath = (path: string) => {
    if (ALLOWED_BACK_PATH.has(path)) {
      this.lastBasePath = path;
    }
  }

  updateState = () => {
    this.location = browserHistory.location;
    this.action = browserHistory.action;
    this.reloadSubject.next();
  };

  createHref = (to: To) => {
    const result = browserHistory.createHref(to);
    this.updateState();
    return result;
  };

  push = (to: To, state?: State) => {
    const pathname = typeof to === "string" ? to : to.pathname!;
    this.pushPreviousPath(this.location.pathname);
    const result = browserHistory.push(
      {
        pathname,
        search: window.location.search,
        hash: window.location.hash,
      },
      state || this.locationState,
    );
    this.updateState();
    return result;
  };

  replace = (to: To, state?: State) => {
    const pathname = typeof to === "string" ? to : to.pathname!;
    this.pushPreviousPath(this.location.pathname);
    const result = browserHistory.replace(
      {
        pathname,
        search: window.location.search,
        hash: window.location.hash,
      },
      state || this.locationState,
    );
    this.updateState();
    return result;
  };

  go = (delta: number) => {
    const result = browserHistory.go(delta);
    this.updateState();
    return result;
  };

  back = () => {
    if (this.lastBasePath) {
      const result = browserHistory.push({
        pathname: this.lastBasePath,
        search: window.location.search,
        hash: window.location.hash,
      });
      this.lastBasePath = null;
      this.updateState();
      return result;
    }
    const result = browserHistory.back();
    this.updateState();
    return result;
  };

  forward = () => {
    const result = browserHistory.forward();
    this.updateState();
    return result;
  };

  listen = (listener: Listener) => {
    const result = browserHistory.listen(listener);
    this.updateState();
    return result;
  };

  block = (blocker: Blocker) => {
    const result = browserHistory.block(blocker);
    this.updateState();
    return result;
  };

  protected prefetch = singleshot(async () => {
    if (basePathSet.has(browserHistory.location.pathname)) {
      browserHistory.push("/");
    }
  });
}

export default RouterService;
