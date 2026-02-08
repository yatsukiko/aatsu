/**
 * Utility functions for the tracker
 */

// Groups to ignore (their releases are not useful for us)
const IGNORED_RELEASE_GROUPS = ['New-raws', 'SubsPlease'];

/**
 * Check if a release should be ignored based on group name
 */
export function shouldIgnoreRelease(title) {
    return IGNORED_RELEASE_GROUPS.some(group => title.includes(`[${group}]`));
}

/**
 * Extract group name from torrent title (e.g., "[SubGroup]" pattern)
 */
export function extractGroupName(title) {
    const match = title.match(/\[([^\]]+)\]/);
    if (!match && title.includes("VARYG")){
        return "VARYG"
    }
    return match ? match[1] : null;
}

/**
 * Format a release object for logging
 */
export function formatRelease(release) {
    return `${release.title} (${release.codec}, ${release.fileSize})`;
}

/**
 * Generate a unique key for a release notification
 */
export function generateReleaseKey(episode, release) {
    return `${episode.aniDBAid}-${episode.epNumber}-${release.id}`;
}
