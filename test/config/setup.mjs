import { sleep } from "functools-kit";
import { setLogger, PersistSignalAdaper, PersistRiskAdapter } from "../../build/index.mjs";

// setLogger(console)

PersistSignalAdaper.usePersistSignalAdapter(class {
  async waitForInit() {
    void 0;
  }
  async readValue() {
    throw new Error("usePersistSignalAdapter readValue should not be called in testbed");
  }
  async hasValue() {
    return false;
  }
  async writeValue() {
    void 0;
  }
});

PersistRiskAdapter.usePersistRiskAdapter(class {
    async waitForInit() {
    void 0;
  }
  async readValue() {
    throw new Error("usePersistRiskAdapter readValue should not be called in testbed");
  }
  async hasValue() {
    return false;
  }
  async writeValue() {
    void 0;
  }
})

