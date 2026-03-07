import { TypedField, FieldType } from "react-declarative";

import { AccessTime } from '@mui/icons-material';
import { AssignmentLate } from '@mui/icons-material';
import { DirectionsRun } from '@mui/icons-material';
import { HighlightOff } from '@mui/icons-material';
import { MarkChatUnread } from '@mui/icons-material';
import { PointOfSale } from '@mui/icons-material';
import { Work } from '@mui/icons-material';
import IndicatorValueWidget from "../widgets/IndicatorValueWidget";

export const status_fields: TypedField[] = [
  {
    type: FieldType.Hero,
    columns: "6",
    phoneColumns: "12",
    phoneRight: '0px',
    height: `33vh`,
    right: '10px',
    bottom: '10px',
    child: {
      type: FieldType.Component,
      element: ({
        indicatorValues
      }) => (
        <IndicatorValueWidget
          color="#4FC0E8"
          label='New chats'
          value={indicatorValues.newChats}
          icon={MarkChatUnread}
        />
      ),
    },
  },
  {
    type: FieldType.Hero,
    columns: "6",
    phoneColumns: "12",
    phoneRight: '0px',
    height: `33vh`,
    right: '10px',
    bottom: '10px',
    child: {
      type: FieldType.Component,
      element: ({
        indicatorValues
      }) => (
        <IndicatorValueWidget
          color="#fc6e51"
          label='New sales'
          value={indicatorValues.newSales}
          icon={PointOfSale}
        />
      ),
    },
  },
  {
    type: FieldType.Hero,
    columns: "4",
    phoneColumns: "12",
    phoneRight: '0px',
    height: `33vh`,
    right: '10px',
    bottom: '10px',
    child: {
      type: FieldType.Component,
      element: ({
        indicatorValues
      }) => (
        <IndicatorValueWidget
          color="#7FB537"
          label='Hours worked'
          value={indicatorValues.hoursWorked}
          icon={Work}
        />
      ),
    },
  },
  {
    type: FieldType.Hero,
    columns: "4",
    phoneColumns: "12",
    phoneRight: '0px',
    height: `33vh`,
    right: '10px',
    bottom: '10px',
    child: {
      type: FieldType.Component,
      element: ({
        indicatorValues
      }) => (
        <IndicatorValueWidget
          color="#FE9B31"
          label='Late arrivals'
          value={indicatorValues.lateArrivals}
          icon={AssignmentLate}
        />
      ),
    },
  },
  {
    type: FieldType.Hero,
    columns: "4",
    phoneColumns: "12",
    phoneRight: '0px',
    height: `33vh`,
    right: '10px',
    bottom: '10px',
    child: {
      type: FieldType.Component,
      element: ({
        indicatorValues
      }) => (
        <IndicatorValueWidget
          color="#ffce54"
          label='Absence hours'
          value={indicatorValues.abscenceHours}
          icon={DirectionsRun}
        />
      ),
    },
  },
  {
    type: FieldType.Hero,
    columns: "6",
    phoneColumns: "12",
    phoneRight: '0px',
    height: `33vh`,
    right: '10px',
    bottom: '10px',
    child: {
      type: FieldType.Component,
      element: ({
        indicatorValues
      }) => (
        <IndicatorValueWidget
          color="#967adc"
          label='Overtime'
          value={indicatorValues.overtime}
          icon={AccessTime}
        />
      ),
    },
  },
  {
    type: FieldType.Hero,
    columns: "6",
    phoneColumns: "12",
    phoneRight: '0px',
    height: `33vh`,
    right: '10px',
    bottom: '10px',
    child: {
      type: FieldType.Component,
      element: ({
        indicatorValues
      }) => (
        <IndicatorValueWidget
          color="#da4453"
          label='Downtime'
          value={indicatorValues.downTime}
          icon={HighlightOff}
        />
      ),
    },
  },
];
