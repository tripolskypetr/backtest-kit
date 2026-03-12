import { compose, singleshot } from "functools-kit";
import { shutdownEmitter } from "../config/emitters";
import backtest from "../lib";
import { listenDoneBacktest, listenDoneLive } from "./event";
import { Backtest } from "../classes/Backtest";
import { Live } from "../classes/Live";

const SHUTDOWN_METHOD_NAME = "shutdown.shutdown";

const CALL_SHUTDOWN_FN = async () => {
    for (const strategy of await Backtest.list()) {
        if (strategy.status === "pending") {
            return false;
        }
    }

    for (const strategy of await Live.list()) {
        if (strategy.status === "pending") {
            return false;
        }
    }

    await shutdownEmitter.next();
    
    return true;
}

const DO_SHUTDOWN_FN = singleshot(async () => {

    if (await CALL_SHUTDOWN_FN()) {
        return;
    }
    
    let disposeRef: Function;
    
    const unLive = listenDoneLive(async () => {
        if (await CALL_SHUTDOWN_FN()) {
            disposeRef && disposeRef();
        }
    })
    const unBacktest = listenDoneBacktest(async () => {
        if (await CALL_SHUTDOWN_FN()) {
            disposeRef && disposeRef();
        }
    });

    disposeRef = compose(
        () => unLive(),
        () => unBacktest(),
    );
});

/**
 * Gracefully shuts down the backtest execution by emitting a shutdown event.
 * This allows all components that subscribe to the shutdownEmitter to perform necessary cleanup before the process exits.
 * The shutdown method is typically called in response to a termination signal (e.g., SIGINT) to ensure a clean exit.
 */
export function shutdown() {
    backtest.loggerService.log(SHUTDOWN_METHOD_NAME);
    DO_SHUTDOWN_FN();
}
