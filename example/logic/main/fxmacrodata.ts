interface FXMacroDataReleaseEvent {
  date?: string;
  release?: string;
  name?: string;
  market_tier?: number;
  top_tier_for_currency?: boolean;
  announcement_datetime?: number;
  announcement_datetime_utc?: string;
}

interface FXMacroDataCalendarOptions {
  currency?: string;
  limit?: number;
  minTier?: number;
  apiKey?: string;
}

const FXMACRODATA_BASE_URL = "https://fxmacrodata.com/api/v1";

const getFxMacroDataCalendar = async ({
  currency = "usd",
  limit = 50,
  minTier = 1,
  apiKey,
}: FXMacroDataCalendarOptions = {}): Promise<FXMacroDataReleaseEvent[]> => {
  const limitCount = Math.max(1, Math.min(limit, 100));
  const params = new URLSearchParams({
    limit: String(limitCount),
  });
  if (apiKey) {
    params.set("api_key", apiKey);
  }

  const response = await fetch(
    `${FXMACRODATA_BASE_URL}/calendar/${currency.toLowerCase()}?${params.toString()}`,
  );
  if (!response.ok) {
    throw new Error(`FXMacroData returned ${response.status} ${response.statusText}`);
  }

  const payload = await response.json() as { data?: FXMacroDataReleaseEvent[] };
  return (payload.data ?? [])
    .filter((event) => (event.market_tier ?? 99) <= minTier)
    .slice(0, limitCount);
};

const buildFxMacroDataEventDateSet = async (
  options: FXMacroDataCalendarOptions = {},
): Promise<Set<string>> => {
  const events = await getFxMacroDataCalendar(options);
  return new Set(events.map((event) => event.date).filter(Boolean) as string[]);
};

export {
  buildFxMacroDataEventDateSet,
  getFxMacroDataCalendar,
  FXMacroDataReleaseEvent,
  FXMacroDataCalendarOptions,
};
