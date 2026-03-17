import { IOutletModalProps, ScrollView } from "react-declarative";
import { Box } from "@mui/material";
import Markdown from "../../../components/common/Markdown";

export const MarkdownView = ({ data }: IOutletModalProps) => (
    <Box sx={{ height: "100%", width: "100%", pt: 1 }}>
        <ScrollView withScrollbar hideOverflowX sx={{ height: "100%" }}>
            <div>
                <Markdown content={data || "# Нет данных"} />
                <Box sx={{ paddingBottom: "65px" }} />
            </div>
        </ScrollView>
    </Box>
);

export default MarkdownView;
