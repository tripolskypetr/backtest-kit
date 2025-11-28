export const GLOBAL_CONFIG = {
    /**
     * Time to wait for scheduled signal to activate (in minutes)
     * If signal does not activate within this time, it will be cancelled.
     */
    CC_SCHEDULE_AWAIT_MINUTES: 120,
}

/**
 * Type for global configuration object.
 */
export type GlobalConfig = typeof GLOBAL_CONFIG;
