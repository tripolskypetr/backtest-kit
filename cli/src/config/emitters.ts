import { emitters } from "backtest-kit";
import { BehaviorSubject, singleshot, Subject } from "functools-kit";

const getEntrySubject = singleshot(() => {
  const entrySubject: BehaviorSubject<string> = emitters["entrySubject"];
  if (entrySubject) {
    return entrySubject;
  }
  return new BehaviorSubject<string>();
});

const getReadySubject = singleshot(() => {
  return new Subject<void>();
});

export { getEntrySubject, getReadySubject };
