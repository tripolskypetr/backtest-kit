import {
  TSubject,
  useWizardModal,
} from "react-declarative";
import { createMemoryHistory } from "history";
import routes from "./routes";
import steps from "./steps";
import { IconButton, Stack } from "@mui/material";
import { Close } from "@mui/icons-material";
import { CC_FULLSCREEN_SIZE_REQUEST } from "../../../../../config/params";

const DEFAULT_PATH = "/brief";

const history = createMemoryHistory();

export interface IBreakevenPayload {
  symbol: string;
  strategyName: string;
  exchangeName: string;
}

interface IParams {
  payload: {
    getContext: () => IBreakevenPayload;
    reloadSubject: TSubject<void>;
  };
}

export const useBreakevenModal = ({ payload }: IParams) => {
  const { pickData, render } = useWizardModal({
    history,
    animation: "none",
    title: "Move to Breakeven",
    AfterTitle: ({ onClose }) => (
      <Stack direction="row" gap={1}>
        <IconButton size="small" onClick={onClose}>
          <Close />
        </IconButton>
      </Stack>
    ),
    mapPayload: () => payload,
    pathname: DEFAULT_PATH,
    sizeRequest: CC_FULLSCREEN_SIZE_REQUEST,
    routes,
    steps,
    onSubmit: async (data) => {
      if (data) {
        await payload.reloadSubject.next();
      }
      return true;
    },
  });

  return {
    pickData: () => {
      history.push(DEFAULT_PATH);
      pickData();
    },
    render,
  };
};

export default useBreakevenModal;
