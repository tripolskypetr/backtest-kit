import { IOutletModalProps, One, ScrollView } from "react-declarative";
import { Box } from "@mui/material";
import { defaultSlots } from "../../../components/OneSlotFactory";
import order_sync_open_fields from "../../../assets/order_sync_open_fields";

export const OrderSyncOpenView = ({ data }: IOutletModalProps) => {
  return (
    <Box sx={{ height: "100%", width: "100%", pt: 1 }}>
      <ScrollView withScrollbar hideOverflowX sx={{ height: "100%" }}>
        <div>
          <One slots={defaultSlots} fields={order_sync_open_fields} handler={() => data} />
          <Box sx={{ paddingBottom: "65px" }} />
        </div>
      </ScrollView>
    </Box>
  );
};

export default OrderSyncOpenView;
