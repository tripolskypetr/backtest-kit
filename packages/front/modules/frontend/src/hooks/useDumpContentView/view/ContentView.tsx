import { AutoSizer, IOutletModalProps } from "react-declarative";
import { Box } from "@mui/material";
import CodeEditor from "../../../components/common/CodeEditor";
import { makeStyles } from "../../../styles";

const useStyles = makeStyles()({
    root: {
        height: "100%",
        width: "100%",
        pt: 1,
        display: "flex",
        alignItems: "stretch",
        justifyContent: "stretch",
    },
    container: {
        flex: 1,
        position: "relative",
        overflow: "hidden",
    },
    content: {
        position: "absolute",
        top: 0,
        left: 0,
        height: "100%",
        width: "100%",
    },
});

export const ContentView = ({ data }: IOutletModalProps) => {
    const { classes } = useStyles();
    return (
        <div className={classes.root}>
            <div className={classes.container}>
                <AutoSizer>
                    {({ height, width }) => (
                        <CodeEditor
                            className={classes.content}
                            height={height}
                            width={width}
                            mimeType={data.mimeType}
                            code={data.content}
                        />
                    )}
                </AutoSizer>
            </div>
        </div>
    );
};

export default ContentView;
