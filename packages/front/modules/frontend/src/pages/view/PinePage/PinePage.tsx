import { compose } from "react-declarative";

import { CodeProvider } from "./context/CodeContext";
import { FromDateProvider } from "./context/FromDateContext";
import { LimitProvider } from "./context/LimitContext";
import { SymbolProvider } from "./context/SymbolContext";
import { TimeframeProvider } from "./context/TimeframeContext";
import { ToDateProvider } from "./context/ToDateContext";

import MainView from "./view/MainView";

const renderCodeProvider = (node: React.ReactNode) => <CodeProvider>{node}</CodeProvider>;
const renderFromDateProvider = (node: React.ReactNode) => <FromDateProvider>{node}</FromDateProvider>;
const renderToDateProvider = (node: React.ReactNode) => <ToDateProvider>{node}</ToDateProvider>;
const renderLimitProvider = (node: React.ReactNode) => <LimitProvider>{node}</LimitProvider>;
const renderSymbolProvider = (node: React.ReactNode) => <SymbolProvider>{node}</SymbolProvider>;
const renderTimeframeProvider = (node: React.ReactNode) => <TimeframeProvider>{node}</TimeframeProvider>;

const render = compose(
  renderCodeProvider,
  renderFromDateProvider,
  renderToDateProvider,
  renderLimitProvider,
  renderSymbolProvider,
  renderTimeframeProvider,
);

export const PinePage = () => render(<MainView />);

export default PinePage;
