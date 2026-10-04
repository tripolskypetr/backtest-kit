import { IconButton, SxProps } from "@mui/material";
import { FieldType, OneButton, Subject, TypedField } from "react-declarative";

import { makeStyles } from "../../../styles";

import { Timeframe } from "../model/Timeframe.model";

import QueryBuilder from "@mui/icons-material/QueryBuilder";
import Close from "@mui/icons-material/Close";

import { t } from "../../../i18n";

const closeSubject = new Subject<void>();

const fields: TypedField[] = [
    {
        type: FieldType.Box,
        sx: {
            minWidth: 256,
        },
        fields: [
            {
                type: FieldType.Box,
                sx: {
                    display: "grid",
                    alignItems: "center",
                    gridTemplateColumns: "auto 1fr auto",
                    marginBottom: "24px",
                },
                fields: [
                    {
                        type: FieldType.Typography,
                        fieldRightMargin: "0",
                        fieldBottomMargin: "0",
                        typoVariant: "h6",
                        placeholder: t("Timeframe Picker"),
                    },
                    {
                        type: FieldType.Div,
                    },
                    {
                        type: FieldType.Component,
                        element: () => (
                            <IconButton
                                size="small"
                                onClick={() => closeSubject.next()}
                            >
                                <Close />
                            </IconButton>
                        ),
                    },
                ],
            },
            {
                type: FieldType.Combo,
                fieldRightMargin: "0",
                fieldBottomMargin: "3",
                noBaseline: true,
                sx: {
                    minWidth: "125px",
                },
                itemList: ["1m", "15m", "1h"],
                tr: (v) => LABEL_MAP[v] || v,
                name: "timeframe",
                title: "",
                placeholder: t("Timeframe"),
            },
            {
                type: FieldType.Button,
                buttonVariant: "contained",
                fieldBottomMargin: "0",
                fieldRightMargin: "0",
                placeholder: t("Close"),
                click: () => closeSubject.next(),
            },
        ],
    },
];

interface ITimeframeProps {
    className?: string;
    style?: React.CSSProperties;
    sx?: SxProps;
    value: Timeframe;
    onChange: (value: Timeframe) => void;
}

const useStyles = makeStyles()((theme) => ({
    root: {
        marginRight: theme.spacing(1),
        opacity: 0.8,
        [theme.breakpoints.down("lg")]: {
            display: "none",
        },
    },
}));

const LABEL_MAP = {
    "1m": t("Timeframe 1m"),
    "15m": t("Timeframe 15m"),
    "1h": t("Timeframe 1h"),
};

export const TimeframePicker = ({
    className,
    style,
    sx,
    value: timeframe = "1m",
    onChange,
}: ITimeframeProps) => {
    const { classes, cx } = useStyles();
    return (
        <OneButton
            className={cx(classes.root, className)}
            startIcon={<QueryBuilder />}
            closeSubject={closeSubject}
            color="warning"
            variant="text"
            size="small"
            noBadge
            fields={fields}
            style={style}
            sx={sx}
            onChange={({ timeframe }, initial) => {
                if (initial) {
                    return;
                }
                onChange(timeframe);
                closeSubject.next();
            }}
            handler={() => ({ timeframe })}
        >
            {LABEL_MAP[timeframe]}
        </OneButton>
    );
};

export default TimeframePicker;
