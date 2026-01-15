import type { Legislation } from '@/types/legislation';
import { failedPatterns } from "@/types/legislation";


/**
 * Check if a single action string indicates failed status
 * Used for timeline highlighting
 */
export function isFailedAction(action: string): boolean {
    if (!action) return false;

    return failedPatterns.some(pattern => pattern.test(action));
}

/**
 * Optimized function to detect if legislation has failed
 * First checks the pre-computed failedAt field, falls back to pattern matching
 */
export function isLegislationFailed(legislation: Legislation | any): boolean {
    // If we have the pre-computed field, use it for maximum performance
    if (legislation?.failedAt) {
        return true;
    }

    // Fallback to pattern matching for backward compatibility
    return detectFailedByPatterns(legislation) !== null;
}

/**
 * Pattern-based failed detection (used for computing the failedAt field)
 * Returns the date of failure if found, null otherwise
 */
export function detectFailedByPatterns(legislation: Legislation | any): Date | null {
    // Check latest action description
    if (legislation.latestActionDescription) {
        for (const pattern of failedPatterns) {
            if (pattern.test(legislation.latestActionDescription)) {
                // Return the date of the latest action if it matches
                return legislation.latestActionAt ? new Date(legislation.latestActionAt) : new Date();
            }
        }
    }

    // Check history for failed actions (return the most recent failure)
    if (legislation.history && Array.isArray(legislation.history)) {
        // Sort history by date descending to find most recent failure
        const sortedHistory = [...legislation.history].sort((a, b) => {
            const dateA = a.date ? new Date(a.date).getTime() : 0;
            const dateB = b.date ? new Date(b.date).getTime() : 0;
            return dateB - dateA;
        });

        for (const historyItem of sortedHistory) {
            if (historyItem.action) {
                for (const pattern of failedPatterns) {
                    if (pattern.test(historyItem.action)) {
                        return historyItem.date ? new Date(historyItem.date) : new Date();
                    }
                }
            }
        }
    }

    return null;
}

/**
 * Get failed legislation statistics for analytics
 */
export function getFailedStats(legislations: Legislation[]): {
    total: number;
    failed: number;
    percentage: number;
} {
    const failed = legislations.filter(isLegislationFailed).length;
    return {
        total: legislations.length,
        failed,
        percentage: legislations.length > 0 ? (failed / legislations.length) * 100 : 0
    };
}
