import { LoaderView } from "react-declarative";

export const createRedirect = (handler: () => void) => () => (
  <LoaderView
    handler={async () => {
      // TODO: check auth
      await handler();
    }}
    height="calc(100vh - 80px)"
  />
);

export default createRedirect;
