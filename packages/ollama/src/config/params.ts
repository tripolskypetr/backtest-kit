declare function parseInt(value: unknown): number;

export const CC_ENABLE_DEBUG = "CC_ENABLE_DEBUG" in process.env ? !!parseInt(process.env.CC_ENABLE_DEBUG) : false;
