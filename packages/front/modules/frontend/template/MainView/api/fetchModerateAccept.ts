import { fetchApi, randomString } from "react-declarative";

export const fetchModerateAccept = async (symbol: string, comment: string): Promise<void> => {
  const { error } = await fetchApi("/moderate/accept", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${localStorage.getItem("tradegpt-token")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requestId: randomString(),
      serviceName: "confirm-app",
      symbol,
      comment,
    }),
  });

  if (error) {
    throw new Error(error);
  }
};

export default fetchModerateAccept;
