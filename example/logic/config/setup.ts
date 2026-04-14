import dayjs from "dayjs";
import isToday from "dayjs/plugin/isToday";
import localeData from "dayjs/plugin/localeData";
import ruLocale from "dayjs/locale/ru";
import utc from "dayjs/plugin/utc";
import { setConfig } from "agent-swarm-kit";

dayjs.extend(localeData);
dayjs.extend(utc);
dayjs.extend(isToday);

dayjs.locale(ruLocale);

setConfig({
    CC_MAX_NESTED_EXECUTIONS: Infinity,
})
