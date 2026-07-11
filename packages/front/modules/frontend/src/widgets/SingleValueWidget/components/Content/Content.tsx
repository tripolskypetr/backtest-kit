import { useMemo } from "react";
import classNames from "clsx";

import { formatAmount } from "react-declarative";

import { makeStyles } from '../../../../styles';
import { t } from "../../../../i18n";

import Typography from "@mui/material/Typography";

import usePropsContext from "../../context/PropsContext";

import roundNumber from "../../../../utils/roundNumber";

import { BackgroundMode } from "../../model/BackgroundMode";
import Caption from "../Caption";

interface IContentProps {
  className?: string;
  style?: React.CSSProperties;
  backgroundColor: string;
}

const useStyles = makeStyles()((theme) => ({
  root: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
  },
  solidBackground: {
    "& > :first-of-type": {
      color: "#fff",
      fontWeight: "bold"
    },
    "& > :last-of-type": { color: "#fff" }
  },
  unsetBackground: {
    "& > :first-of-type": {
      color: theme.palette.text.primary,
      fontWeight: "bold"
    },
    "& > :last-of-type": { color: theme.palette.text.primary, }
  },
  semiBackground: {
    "& > :first-of-type": {
      color: theme.palette.text.primary,
      fontWeight: "bold"
    },
    "& > :last-of-type": { color: theme.palette.text.primary, }
  },
  content: {
    display: 'flex',
    alignItems: 'baseline',
    flexDirection: "row",
    gap: '2.5px',
    "& > *": { fontWeight: 'bold' },
    "& > :first-of-type": {
      fontSize: '22px',
    },
    "& > :last-of-type": { fontSize: '16px', opacity: 0.85 }
  },
}));

export const Content = ({
  className,
  style: upperStyle,
  backgroundColor,
}: IContentProps) => {
  const { classes } = useStyles();
  const {
    backgroundMode = BackgroundMode.Solid,
    roundDigits = 2,
    value,
    caption,
    valueUnit = t("Unit"),
  } = usePropsContext();

  const style = useMemo(
    () => ({
      ...upperStyle,
      ...(backgroundMode === BackgroundMode.Solid && {
        backgroundColor,
      }),
    }),
    [backgroundColor, backgroundMode, upperStyle]
  );

  return (
    <div
      className={classNames(className, classes.root)}
      style={style}
    >
      <div className={classNames(classes.content, {
        [classes.solidBackground]: backgroundMode === BackgroundMode.Solid,
        [classes.unsetBackground]: backgroundMode === BackgroundMode.Unset,
        [classes.semiBackground]: backgroundMode === BackgroundMode.Semi,
      })}>
        <Typography fontWeight="bold">{formatAmount(roundNumber(value, roundDigits))}</Typography>
        <Typography>{valueUnit}</Typography>
      </div>
      {!!caption && (
        <Caption caption={caption} /> 
      )}
    </div>
  );
};

export default Content;
