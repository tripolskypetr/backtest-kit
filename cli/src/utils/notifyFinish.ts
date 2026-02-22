import { listenDoneBacktest, listenDoneLive } from "backtest-kit";
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
})

export default notifyFinish;
