import { ITabsOutletProps } from "react-declarative";

export const ListView = ({ payload, data }: ITabsOutletProps) => {
  return <p>{JSON.stringify(data, null, 2)}</p>
};

export default ListView;
