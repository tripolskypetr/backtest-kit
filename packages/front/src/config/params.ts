declare function parseInt(value: unknown): number;

export const CC_WWWROOT_PATH = process.env.CC_WWWROOT_PATH || "";
export const CC_WWWROOT_HOST = process.env.CC_WWWROOT_HOST || "0.0.0.0";
export const CC_WWWROOT_PORT = parseInt(process.env.CC_WWWROOT_PORT) || 60050;

export const CC_ENABLE_MOCK = !!parseInt(process.env.CC_ENABLE_MOCK) || false;
