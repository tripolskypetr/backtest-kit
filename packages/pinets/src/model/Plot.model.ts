type PlotData = {
  time: number;
  value: number;
};

type PlotEntry = {
  data: PlotData[];
};

export type PlotModel = Record<string, PlotEntry>;

export type PlotRecord = {
  plots: PlotModel;
}
