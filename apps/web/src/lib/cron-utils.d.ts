/**
 * Common cron expression presets and utilities
 */
export interface CronPreset {
    label: string;
    value: string;
    description: string;
}
export declare const CRON_PRESETS: CronPreset[];
/**
 * Parse a cron expression into human-readable format
 */
export declare function describeCron(cron: string): string;
/**
 * Validate a cron expression
 */
export declare function validateCron(cron: string): {
    valid: boolean;
    error?: string;
};
/**
 * Calculate next run time from cron expression
 */
export declare function getNextRunTime(cron: string): Date | null;
/**
 * Format a date as relative time
 */
export declare function formatRelativeTime(date: Date): string;
//# sourceMappingURL=cron-utils.d.ts.map