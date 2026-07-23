import WalletPrivateService from "../services/private/WalletPrivateService";
import WalletPublicService from "../services/public/WalletPublicService";
import { provide } from "./di";
import { TYPES } from "./types";

{
  provide(TYPES.walletPrivateService, () => new WalletPrivateService());
}

{
  provide(TYPES.walletPublicService, () => new WalletPublicService());
}
