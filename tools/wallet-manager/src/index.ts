import "./core/provide";

import { init, inject } from "./core/di";
import { TYPES } from "./core/types";
import WalletPrivateService from "./services/private/WalletPrivateService";
import WalletPublicService from "./services/public/WalletPublicService";

const privateServices = {
  walletPrivateService: inject<WalletPrivateService>(
    TYPES.walletPrivateService
  ),
};

const publicServices = {
  walletPublicService: inject<WalletPublicService>(TYPES.walletPublicService),
};

const wallet = {
  ...privateServices,
  ...publicServices,
};

init();

export { wallet };

Object.assign(globalThis, { wallet });

export default wallet;
