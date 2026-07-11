import { FadeView } from "react-declarative";

import { makeStyles } from '../../styles';
import { t } from "../../i18n";

import Box from "@mui/material/Box";

import TimeLossItem from "./components/TimeLossItem";

import IItem from "./model/IItem";
import { SxProps } from "@mui/system";
import { Paper } from "@mui/material";

interface ITimeLossProps {
    items: IItem[];
    sx: SxProps;
}

const useStyles = makeStyles()({
    root: {
        position: 'relative',
        width: '100%'
    },
    container: {
        position: 'absolute',
        top: 0,
        height: '100%',
        width: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
    },
    content: {
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'stretch',
        flexDirection: 'column',
    },
})

export const SuccessRateWidget = ({
    items,
    sx,
}: ITimeLossProps) => {
    const { classes } = useStyles();
    return (
        <Paper className={classes.root} sx={sx}>
            <FadeView disableRight color="#fff" className={classes.container}>
                <div className={classes.content}>
                    {items.map((item, idx) => (
                        <TimeLossItem
                            key={idx}
                            {...item}
                        />
                    ))}
                </div>
            </FadeView>
            <Box 
                sx={{
                    position: 'absolute',
                    bottom: 10,
                    right: 10,
                    zIndex: 10,
                    pointerEvents: 'auto',
                    background: 'rgba(255, 255, 255, 0.1)',
                    backdropFilter: 'blur(10px)',
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    padding: '12px 16px',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
                    opacity: 0.35,
                    transition: 'opacity 0.3s ease',
                    '&:hover': {
                        opacity: 1,
                    },
                }}
            >
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center'
                    }}
                >
                    <div style={{background: '#7FB537', width: 15, height: 15, borderRadius: '3px', marginRight: '5px'}}></div>
                    <span>{t("Take profit")}</span>
                </Box>
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center'
                    }}
                >
                    <div style={{background: '#4FC0E8', width: 15, height: 15, borderRadius: '3px', marginRight: '5px'}}></div>
                    <span>{t("Resolved")}</span>
                </Box>
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center'
                    }}
                >
                    <div style={{background: '#FE9B31', width: 15, height: 15, borderRadius: '3px', marginRight: '5px'}}></div>
                    <span>{t("Rejected")}</span>
                </Box>
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center'
                    }}
                >
                    <div style={{background: '#FA5F5A', width: 15, height: 15, borderRadius: '3px', marginRight: '5px'}}></div>
                    <span>{t("Stop loss")}</span>
                </Box>
            </Box>
        </Paper>
    )
};

export default SuccessRateWidget;
