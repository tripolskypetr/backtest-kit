import { compose, EventEmitter, Subject } from "functools-kit";
import {
  activePingSubject,
  backtestScheduleOpenSubject,
  breakevenSubject,
  doneBacktestSubject,
  doneLiveSubject,
  errorEmitter,
  exitEmitter,
  highestProfitSubject,
  maxDrawdownSubject,
  partialLossSubject,
  partialProfitSubject,
  performanceEmitter,
  progressBacktestEmitter,
  riskSubject,
  schedulePingSubject,
  shutdownEmitter,
  signalBacktestEmitter,
  signalEmitter,
  signalLiveEmitter,
  strategyCommitSubject,
  syncSubject,
  validationSubject,
  signalNotifySubject,
  idlePingSubject,
} from "../config/emitters";
import { backtest } from "../lib";

const METHOD_NAME_CREATE_SNAPSHOT = "SystemUtils.createSnapshot";

/** List of all global subjects whose listeners should be snapshotted for session isolation */
const SUBJECT_ISOLATION_LIST: Subject<unknown>[] = [
  activePingSubject,
  idlePingSubject,
  backtestScheduleOpenSubject,
  breakevenSubject,
  doneBacktestSubject,
  doneLiveSubject,
  errorEmitter,
  exitEmitter,
  highestProfitSubject,
  maxDrawdownSubject,
  partialLossSubject,
  partialProfitSubject,
  performanceEmitter,
  progressBacktestEmitter,
  riskSubject,
  schedulePingSubject,
  shutdownEmitter,
  signalBacktestEmitter,
  signalEmitter,
  signalLiveEmitter,
  strategyCommitSubject,
  syncSubject,
  validationSubject,
  signalNotifySubject,
];

/** Event key type accepted by EventEmitter */
type EventKey = string | symbol;
/** Generic event listener function */
type Function = (...args: any[]) => void;
/** Internal events map: event key → list of listeners */
type Events = Record<EventKey, Function[]>;

/** Callable that restores a previously saved subject snapshot */
type RestoreSnapshot = () => void;

/**
 * Creates a snapshot function for a given subject by clearing its internal
 * events map and returning a restore function that can put the original listeners back.
 * @param subject The subject to snapshot
 * @returns A function that restores the subject's original listeners when called
 */
const CREATE_SUBJECT_SNAPSHOT_FN = (subject: Subject<unknown>) => {
  const emitter: EventEmitter = subject["_emitter"];
  const events: Events = emitter["_events"];
  emitter["_events"] = {};
  return () => {
    emitter["_events"] = events;
  };
};

/**
 * Manages isolation of global event-bus state between backtest sessions.
 * Allows temporarily detaching all subject subscriptions so that one session
 * does not interfere with another, then restoring them afterwards.
 */
export class SystemUtils {
  /**
   * Snapshots the current listener state of every global subject by replacing
   * their internal `_events` map with an empty object.
   * @returns A restore function that, when called, puts all original listeners back.
   */
  public createSnapshot = (): RestoreSnapshot => {
    backtest.loggerService.log(METHOD_NAME_CREATE_SNAPSHOT);
    const snapshotList = SUBJECT_ISOLATION_LIST.map(CREATE_SUBJECT_SNAPSHOT_FN);
    return compose(...snapshotList);
  };
}

export const System = new SystemUtils();
