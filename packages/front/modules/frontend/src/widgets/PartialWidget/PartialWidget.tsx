import { Chip, IconButton, Paper, SxProps, Typography } from "@mui/material";
import StatusModel from "../../model/Status.model";
import { makeStyles } from "../../styles";
import { AutoSizer, LoaderView, useAsyncValue } from "react-declarative";

const HEADER_HEIGHT = "35px";

const useStyles = makeStyles()((theme) => ({
    root: {
        position: "relative",
        height: "100%",
        width: "100%",
        background: "#eee",
        overflow: "hidden",
    },
    header: {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingLeft: "8px",
        paddingRight: "4px",
        height: HEADER_HEIGHT,
    },
    text: {
        opacity: 0.5,
        padding: 0,
        margin: 0,
        height: HEADER_HEIGHT,
        display: "flex",
        alignItems: "center",
    },
    title: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
    },
    icon: {
        opacity: 0.5,
        transition: "opacity 500ms",
        "&:hover": {
            opacity: 1.0,
        },
    },
    container: {
        position: "absolute",
        top: HEADER_HEIGHT,
        left: 0,
        right: 0,
        bottom: 0,
        height: `calc(100% - ${HEADER_HEIGHT})`,
        padding: 5,
        width: "100%",
        background: "white",
        overflow: "hidden",
        display: "flex",
        alignItems: "stretch",
        justifyContent: "stretch",
    },
    content: {
        display: "flex",
        flex: 1,
    },
}));

interface IPartialWidgetProps {
    className?: string;
    style?: React.CSSProperties;
    sx?: SxProps;
    data: StatusModel;
}

export const PartialWidget = ({
    className,
    style,
    sx,
}: IPartialWidgetProps) => {
    const { classes, cx } = useStyles();

    const renderInner = () => {
        return null;
    };

    return (
        <Paper className={cx(classes.root, className)} style={style} sx={sx}>
            <div className={classes.header}>
                <div className={classes.title}>
                    <Typography className={classes.text} variant="body1">
                        Partial Exits
                    </Typography>
                    <Chip
                        size="small"
                        variant="outlined"
                        color="info"
                        label="PP/PL"
                    />
                </div>
            </div>
            <div className={classes.container}>
                <div className={classes.content}>{renderInner()}</div>
            </div>
        </Paper>
    );
};

export default PartialWidget;
