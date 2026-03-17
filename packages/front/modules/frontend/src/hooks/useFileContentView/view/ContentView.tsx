import { IOutletModalProps, ScrollView } from "react-declarative";
import { Box, Typography } from "@mui/material";

export const ContentView = ({ data }: IOutletModalProps) => (
    <Box sx={{ height: "100%", width: "100%", pt: 1 }}>
        <ScrollView withScrollbar hideOverflowX sx={{ height: "100%" }}>
            <div>
                <Typography
                    component="pre"
                    variant="body2"
                    sx={{ fontFamily: "monospace", whiteSpace: "pre-wrap", p: 1 }}
                >
                    {data || ""}
                </Typography>
                <Box sx={{ paddingBottom: "65px" }} />
            </div>
        </ScrollView>
    </Box>
);

export default ContentView;
