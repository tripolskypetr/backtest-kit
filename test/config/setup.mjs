import { sleep } from "functools-kit";
import { setLogger, PersistSignalAdaper } from "../../build/index.mjs";

// setLogger(console)

PersistSignalAdaper.usePersistSignalAdapter(class {
  async waitForInit() {
    void 0;
  }
  async readValue() {
    throw new Error("Should not be called in testbed");
  }
  async hasValue() {
    return false;
  }
  async writeValue() {
    void 0;
  }
});

