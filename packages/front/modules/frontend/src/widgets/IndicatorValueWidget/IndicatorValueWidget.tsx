import { darken, getContrastRatio, lighten } from "@mui/material";
import { makeStyles } from "../../styles";

import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { PaperView } from "react-declarative";

const useStyles = makeStyles()({
    root: {
        position: "relative",
        height: "100%",
        width: "100%",
    },
    container: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
});

function isLightColor(hex: string) {
    const contrastWithBlack = getContrastRatio(hex, "#000000");
    const contrastWithWhite = getContrastRatio(hex, "#FFFFFF");
    return contrastWithBlack > contrastWithWhite;
}

interface IIndicatorValueWidgetProps {
    outlinePaper: boolean;
    color: string;
    value: number | string;
    label: string;
    icon?: React.ComponentType<any>;
}

export const IndicatorValueWidget = ({
    color,
    value,
    label,
    outlinePaper,
    icon: Icon = () => <></>,
}: IIndicatorValueWidgetProps) => {
    const { classes } = useStyles();
    return (
        <PaperView outlinePaper={outlinePaper} className={classes.root}>
            <Stack
                className={classes.container}
                direction="column"
                justifyContent="center"
                alignItems="stretch"
                spacing={2}
            >
                <Stack
                    direction="row"
                    justifyContent="center"
                    alignItems="center"
                >
                    <Avatar
                        sx={{
                            background: "#eee !important"
                        }}
                    >
                        <Icon
                            sx={{
                                color: isLightColor(color)
                                    ? darken(color, 0.23)
                                    : lighten(color, 0.23),
                            }}
                        />
                    </Avatar>
                </Stack>

                <Stack
                    direction="row"
                    justifyContent="center"
                    alignItems="center"
                    spacing={0}
                    sx={{
                        "& .MuiChip-outlined": {
                            border: `1px solid ${color}`,
                        },
                    }}
                >
                    <Box
                        style={{
                            flex: 1,
                            height: "2px",
                            background: color,
                        }}
                    />
                    <Chip variant="outlined" label={label} style={{ color }} />
                    <Box
                        style={{
                            flex: 1,
                            height: "2px",
                            background: color,
                        }}
                    />
                </Stack>
                <Stack
                    direction="row"
                    justifyContent="center"
                    alignItems="center"
                >
                    <Typography variant="h4" color={color}>
                        {value}
                    </Typography>
                </Stack>
            </Stack>
        </PaperView>
    );
};

export default IndicatorValueWidget;
