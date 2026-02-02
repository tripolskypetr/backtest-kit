import { dayjs } from "react-declarative";

import isToday from "dayjs/plugin/isToday";
import localeData from "dayjs/plugin/localeData";
import ruLocale from "dayjs/locale/ru";
import utc from "dayjs/plugin/utc";

dayjs.extend(localeData);
dayjs.extend(utc);
dayjs.extend(isToday);

dayjs.locale(ruLocale);
