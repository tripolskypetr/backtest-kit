import { makeStyles } from '../../../styles';
import { t } from "../../../i18n";

import Box from "@mui/material/Box";
import { Avatar, ListItemText } from "@mui/material";

import ColorProgressBar from "./ColorProgressBar";
import IItem from '../model/IItem';

const useStyles = makeStyles()(
  {
    root: {
      display: 'flex',
    },
    work: {
      display: 'flex',
      alignItems: 'center',

    },
    row: {
      flex: 1,
      paddingLeft: 5,
      paddingRight: 5,
      paddingBottom: 15,
    }
  }
)

interface ITimeLossItemProps extends IItem {
}

export const TimeLossItem = ({
  title,
  description,
  avatar: Avatar,
  done,
  inprogress,
  waiting,
  archive
}: ITimeLossItemProps) => {
  const { classes } = useStyles();
  return (
    <Box className={classes.root}>
      <Box className={classes.row}>
        <Box className={classes.work}>
          <Avatar />
          <ListItemText
            primary={title}
            secondary={description}
            sx={{ flex: 'none', marginLeft: '0.5em' }}
          />
        </Box>
        <Box flex="1">
          <ColorProgressBar
            data={{
              done: { color: '#7FB537', title: t('Take profit'), value: done },
              inprogress: { color: '#4FC0E8', title: t('Resolved'), value: inprogress },
              waiting: { color: '#FE9B31', title: t('Rejected'), value: waiting },
              archive: { color: '#FA5F5A', title: t('Stop loss'), value: archive }
            }}
          />
        </Box>
      </Box>
    </Box>
  )
};

export default TimeLossItem;
