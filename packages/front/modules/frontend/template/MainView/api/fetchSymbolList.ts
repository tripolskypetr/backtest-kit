import { singleshot, fetchApi, randomString } from "react-declarative";

export const fetchSymbolList = singleshot(async (): Promise<string[]> => {
  const { error, data } = await fetchApi("/dict/symbol/list", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${localStorage.getItem("tradegpt-token")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requestId: randomString(),
      serviceName: "candle-app",
    }),
  });
  if (error) {
    throw new Error(error);
  }
  return data;
});