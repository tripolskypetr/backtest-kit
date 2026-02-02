import { IOutletModalProps, One, ScrollView } from "react-declarative";
import { Box } from "@mui/material";
import { defaultSlots } from "../../../components/OneSlotFactory";
import partial_profit_available_fields from "../../../assets/partial_profit_available_fields";

export const PartialProfitAvailableView = ({ data }: IOutletModalProps) => {
  return (
    <Box sx={{ height: "100%", width: "100%", pt: 1 }}>
      <ScrollView withScrollbar hideOverflowX sx={{ height: "100%" }}>
        <div>
          <One slots={defaultSlots} fields={partial_profit_available_fields} handler={() => data} />
          <Box sx={{ paddingBottom: "65px" }} />
        </div>
      </ScrollView>
    </Box>
  );
};

export default PartialProfitAvailableView;
