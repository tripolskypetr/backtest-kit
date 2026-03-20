import { fetchApi, randomString } from "react-declarative";
import { ConfirmModel } from "../model/Confirm.model";

const REQUEST_LIMIT = 25;

export const fetchModerateList = async (): Promise<ConfirmModel[]> => {
  const { error, data } = await fetchApi("/moderate/list", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${localStorage.getItem("tradegpt-token")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requestId: randomString(),
      serviceName: "confirm-app",
      limit: REQUEST_LIMIT,
      offset: 0,
    }),
  });

  if (error) {
    throw new Error(error);
  }

  return data as ConfirmModel[];
};

export default fetchModerateList;
