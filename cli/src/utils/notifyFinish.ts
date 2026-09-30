import { listenDoneBacktest, listenDoneLive, shutdown } from "tradeforge";
import { compose, singleshot } from "functools-kit";

export const notifyFinish = singleshot(() => {
    let disposeRef: Function;
    const unLive = listenDoneLive(() => {
        console.log("Live trading finished");
        disposeRef && disposeRef();
    })
    const unBacktest = listenDoneBacktest(() => {
        console.log("Backtest trading finished");
        disposeRef && disposeRef();
    });
    disposeRef = compose(
        () => unLive(),
        () => unBacktest(),
    );
    shutdown();
})

export default notifyFinish;
