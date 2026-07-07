import { dayjs } from "react-declarative";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  LineElement,
  LineController,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

import isToday from "dayjs/plugin/isToday";
import localeData from "dayjs/plugin/localeData";
import enLocale from "dayjs/locale/en-gb";
import utc from "dayjs/plugin/utc";
import timezone from 'dayjs/plugin/timezone';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  LineElement,
  LineController,
  PointElement,
  Title,
  Tooltip,
  Legend,
);

{
    dayjs.extend(localeData);
    dayjs.extend(utc);
    dayjs.extend(isToday);
    dayjs.extend(timezone);
    dayjs.locale(enLocale);
}
