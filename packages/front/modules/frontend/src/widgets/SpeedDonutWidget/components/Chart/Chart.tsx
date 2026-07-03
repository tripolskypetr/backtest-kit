import { useMemo } from "react";

import { makeStyles } from "../../../../styles";

import classNames from "clsx";

import usePropsContext from "../../context/PropsContext";
import { IItem } from "../../model/IProps";

import { Donut } from "./Donut/Donut";

interface IChartProps {
  className?: string;
  width: number;
  height: number;
}

interface IChunk extends IItem {
  minValue: number;
  value: number;
}

const useStyles = makeStyles()({
  root: {
    display: "flex",
    alignItems: "stretch",
    justifyContent: "stretch",
    overflow: "clip"
  },
  container: {
    flex: 1,
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },
  bottomCenterLabel: {
    position: "absolute",
    zIndex: 2,
    bottom: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: "4px",
    "& > *": { fontSize: "20px", lineHeight: "24px" },
    "& > :first-of-type": { fontWeight: "bold" },
    "& > :last-of-type": { color: "var(--black-6)" }
  }
});

export const Chart = ({ className, height, width }: IChartProps) => {
  const { classes } = useStyles();
  const { value, items } = usePropsContext();

  const donutSide = Math.min(height * 2, width);

  const chunks = useMemo(
    (): IChunk[] =>
      [...items]
        .filter(item => !item.hidden)
        .sort(({ maxValue: a }, { maxValue: b }) => b - a)
        .map((item, idx, items) => {
          const nextItem = items[idx + 1];
          const minValue = nextItem ? nextItem.maxValue : 0;
          return {
            ...item,
            minValue,
            value: item.maxValue - minValue,
          };
        }),
    [items]
  );

  const chartColor = useMemo(() => {
    if (!chunks.length) {
      return "#ccc";
    }
    const chunk = chunks.find(
      ({ minValue, maxValue }) => value >= minValue && value <= maxValue
    );
    if (chunk) {
      return chunk.color;
    }
    // Значение вне шкалы: выше максимума — цвет верхней зоны,
    // ниже минимума — нижней (chunks отсортированы по maxValue убыванию)
    const top = chunks[0];
    const bottom = chunks[chunks.length - 1];
    return value > top.maxValue ? top.color : bottom.color;
  }, [chunks, value]);

  const minValue = useMemo(
    () =>
      chunks.reduce(
        (acm, { minValue }) => Math.min(acm, minValue),
        Number.POSITIVE_INFINITY
      ),
    [chunks]
  );

  const maxValue = useMemo(
    () =>
      chunks.reduce(
        (acm, { maxValue }) => Math.max(acm, maxValue),
        Number.NEGATIVE_INFINITY
      ),
    [chunks]
  );

  return (
    <div className={classNames(className, classes.root)}>
      <div className={classes.container}>
        <Donut
          chunks={chunks}
          value={value}
          minValue={minValue}
          maxValue={maxValue}
          side={donutSide}
          width={width}
          color={chartColor}
        />
      </div>
    </div>
  );
};

export default Chart;
