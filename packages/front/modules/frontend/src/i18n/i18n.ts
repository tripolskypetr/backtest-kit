import { t } from "./tools/t";
import Translate from "../components/Translate";

Translate.install({}, t, {
  rawCondition: (c) => /[ЁёА-я]/.test(c),
  useRawMark: false,
});
