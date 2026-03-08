import { dayjs } from "react-declarative";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

import isToday from "dayjs/plugin/isToday";
import localeData from "dayjs/plugin/localeData";
import ruLocale from "dayjs/locale/ru";
import utc from "dayjs/plugin/utc";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
);

{
    dayjs.extend(localeData);
    dayjs.extend(utc);
    dayjs.extend(isToday);

    dayjs.locale(ruLocale);
}
