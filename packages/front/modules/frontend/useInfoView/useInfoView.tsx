import {
  useActualState,
  useModalManager,
  useTabsModal,
  History,
  useActualRef,
  ActionIcon,
  randomString,
} from "react-declarative";
import IconButton from "@mui/material/IconButton";
import { ArrowBack, Close, Download } from "@mui/icons-material";
import { createMemoryHistory } from "history";
import routes from "./routes";
import { CC_FULLSCREEN_SIZE_REQUEST } from "../../config/params";
import tabs from "./tabs";
import { Box, Stack } from "@mui/material";
import downloadMarkdown from "../../utils/downloadMarkdown";
import { useLoader } from "../../components/LoaderProvider";
import fetchApi from "../../utils/fetchApi";
import { generateMarkdown } from "./utils/generateMarkdown";

const DEFAULT_PATH = "/order_info/main";

const history = createMemoryHistory();

const getSignalInfo = async (id: string) => {
  const { error, data } = await fetchApi(`/info/one/${id}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${localStorage.getItem("tradegpt-token")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requestId: randomString(),
      serviceName: "info-app",
    }),
  });
  if (error) {
    throw new Error(error);
  }
  return data;
};


const fetchData = async (id: string) => {
  const infoData = await getSignalInfo(id);

  const tabRecord = {
    strategy: null,
    long: null,
    swing: null,
    short: null,
    mastodon: null,
    twitter: null,
    volume: null,
    price: null,
    slope: null,
  };


  return {
    infoData,
    ...tabRecord,
  };
};

export const useOrderInfoView = () => {
  const [, setLoader] = useLoader();

  const [id$, setId] = useActualState("");
  const ctx = useModalManager();
  const { push, pop } = ctx;

  const [pathname$, setPathname] = useActualRef(history.location.pathname);

  const handleTabChange = (id: string, history: History) => {
    if (id === "main") {
      history.replace(`/order_info/main`);
      setPathname(`/order_info/main`);
    }
    if (id === "slope") {
      history.replace(`/order_info/slope`);
      setPathname(`/order_info/slope`);
    }
    if (id === "long") {
      history.replace(`/order_info/long`);
      setPathname(`/order_info/long`);
    }
    if (id === "swing") {
      history.replace(`/order_info/swing`);
      setPathname(`/order_info/swing`);
    }
    if (id === "short") {
      history.replace(`/order_info/short`);
      setPathname(`/order_info/short`);
    }
    if (id === "mastodon") {
      history.replace(`/order_info/mastodon`);
      setPathname(`/order_info/mastodon`);
    }
    if (id === "twitter") {
      history.replace(`/order_info/twitter`);
      setPathname(`/order_info/twitter`);
    }
    if (id === "volume") {
      history.replace(`/order_info/volume`);
      setPathname(`/order_info/volume`);
    }
    if (id === "price") {
      history.replace(`/order_info/price`);
      setPathname(`/order_info/price`);
    }
  };

  const handleDownload = async () => {
    if (pathname$.current === "/order_info/main") {
      const report = await getSignalInfo(id$.current);
      const content = generateMarkdown(report);
      await downloadMarkdown(content);
      return;
    }
    const data = await fetchData(id$.current);
    if (pathname$.current === "/order_info/strategy") {
      await downloadMarkdown(data.strategy?.content);
      return;
    }
    if (pathname$.current === "/order_info/long") {
      await downloadMarkdown(data.long?.content);
      return;
    }
    if (pathname$.current === "/order_info/swing") {
      await downloadMarkdown(data.swing?.content);
      return;
    }
    if (pathname$.current === "/order_info/short") {
      await downloadMarkdown(data.short?.content);
      return;
    }
    if (pathname$.current === "/order_info/mastodon") {
      await downloadMarkdown(data.mastodon?.content);
      return;
    }
    if (pathname$.current === "/order_info/twitter") {
      await downloadMarkdown(data.twitter?.content);
      return;
    }
    if (pathname$.current === "/order_info/volume") {
      await downloadMarkdown(data.volume?.content);
      return;
    }
    if (pathname$.current === "/order_info/slope") {
      await downloadMarkdown(data.slope?.content);
      return;
    }
    if (pathname$.current === "/order_info/price") {
      await downloadMarkdown(data.price?.content);
      return;
    }
  };

  const { pickData, render } = useTabsModal({
    tabs,
    withStaticAction: true,
    onTabChange: handleTabChange,
    animation: "none",
    title: "Информация о сигнале",
    sizeRequest: CC_FULLSCREEN_SIZE_REQUEST,
    history,
    routes,
    BeforeTitle: ({ onClose }) => {
      const { total } = useModalManager();
      return (
        <Box
          sx={{
            mr: 1,
            display: total === 1 ? "none" : "flex",
          }}
        >
          <ActionIcon onClick={onClose}>
            <ArrowBack />
          </ActionIcon>
        </Box>
      );
    },
    AfterTitle: ({ onClose }) => (
      <Stack direction="row" gap={1}>
        <ActionIcon onClick={() => handleDownload()}>
          <Download />
        </ActionIcon>
        <ActionIcon onClick={onClose}>
          <Close />
        </ActionIcon>
      </Stack>
    ),
    fetchState: async () => await fetchData(id$.current),
    mapInitialData: ([{ infoData, ...other }]) => ({
      main: infoData,
      ...other,
    }),
    mapPayload: ([
      {
        strategy = null,
        long = null,
        swing = null,
        short = null,
        mastodon = null,
        twitter = null,
        volume = null,
        price = null,
        slope = null,
      },
    ]) => ({
      strategy: !!strategy,
      long: !!long,
      swing: !!swing,
      short: !!short,
      mastodon: !!mastodon,
      twitter: !!twitter,
      volume: !!volume,
      price: !!price,
      slope: !!slope,
    }),
    onLoadStart: () => setLoader(true),
    onLoadEnd: () => setLoader(false),
    onClose: () => {
      pop();
    },
  });

  return (id: string, route = DEFAULT_PATH) => {
    push({
      id: "order_info",
      render,
      onInit: () => {
        history.push(route);
        setPathname(route);
      },
      onMount: () => {
        setId(id);
        pickData();
      },
    });
  };
};

export default useOrderInfoView;
