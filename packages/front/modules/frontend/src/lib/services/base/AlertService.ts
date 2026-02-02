import { Subject } from "react-declarative";
import { v4 as randomString } from "uuid";

interface IAlert {
  key: string;
  message: string;
  pin: boolean;
}

export class AlertService {
  public readonly reloadSubject = new Subject<void>();

  private _alerts: IAlert[] = [];

  get current() {
    if (this._alerts.length) {
      return this._alerts[0];
    }
    return null;
  }

  hideCurrent = () => {
    if (this._alerts.length > 0) {
      this._alerts.shift();
    }
    this.reloadSubject.next();
  };

  notify = (message: string, pin = false) => {
    this.hideCurrent();
    this._alerts.push({
      key: randomString(),
      pin,
      message,
    });
    this.reloadSubject.next();
  };
}

export default AlertService;
