import classNames from "clsx";

import { makeStyles } from '../../../../styles';

import Typography from "@mui/material/Typography";

import usePropsContext from "../../context/PropsContext";

import roundNumber from "../../../../utils/roundNumber";
import { t } from "../../../../i18n";

interface INoteProps {
  className?: string;
  style?: React.CSSProperties;
}

const useStyles = makeStyles()((theme) => ({
  root: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderLeft: 0,
    borderRight: 0,
    borderWidth: '1px 0',
    borderStyle: 'solid',
    borderColor: theme.palette.divider,
  },
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  content: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '2.5px',
    "& > *": { fontWeight: 'bold' },
    "& > :first-of-type": {
      fontSize: '22px',
    },
    "& > :last-of-type": { fontSize: '16px', opacity: 0.85 }
  },
}));

export const Note = ({ className, style }: INoteProps) => {
  const { classes } = useStyles();
  const { value, roundDigits = 3, valueUnit = t("Unit") } = usePropsContext();
  return (
    <div className={classNames(className, classes.root)} style={style}>
      <div className={classes.container}>
        <div className={classes.content}>
          <Typography>{roundNumber(value, roundDigits)}</Typography>
          <Typography>{valueUnit}</Typography>
        </div>
      </div>
    </div>
  );
};

export default Note;
