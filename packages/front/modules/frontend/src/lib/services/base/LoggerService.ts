import { Subject } from "react-declarative";

export class LoggerService {
  private readonly reloadSubject = new Subject<void>();

  _enabled = false;

  public error = (error: Error) => {
    console.error(error);
  };

  public log = (msg: string, data?: Record<string, any>) => {
    this._enabled && console.log(msg, data);
  };

  protected setEnabled = (enabled: boolean) => {
    this._enabled = enabled;
    this.reloadSubject.next();
  };
}

export default LoggerService;
