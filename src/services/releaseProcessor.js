/**
 * Release processor - Core business logic
 * Processes releases and decides whether to notify
 */

import { sendReleaseNotification } from '../utils/notification.js';
import { generateReleaseKey, shouldIgnoreRelease, extractGroupName } from '../utils/helpers.js';

// Track which releases have been notified about to avoid duplicates
// Persists across all checks (RSS every 30min + 10pm final) until 5am daily cleanup
export const notifiedReleases = new Set();

/**
 * Process a found release:
 * 1. Filter out ignored groups
 * 2. If not already notified, send notification immediately
 * 3. Track as notified to avoid duplicates
 */
export async function processFoundRelease(episode, release, source = 'unknown') {
    // Early filter: skip ignored release groups
    if (shouldIgnoreRelease(release.title)) {
        console.log(`⊘ Ignoring release from blocked group: ${release.title}`);
        return false;
    }

    const releaseKey = generateReleaseKey(episode, release);

    // Skip if we already notified about this release
    if (notifiedReleases.has(releaseKey)) {
        console.log(`ℹ Already notified for: ${release.title}`);
        return false;
    }

    // Extract group name for display
    const groupName = extractGroupName(release.title) || 'Unknown';

    // Send notification immediately
    console.log(`✓ Notifying: ${release.title} [${source}]`);
    await sendReleaseNotification(episode, release, groupName);
    
    // Mark as notified to avoid duplicate notifications
    notifiedReleases.add(releaseKey);
    return true;
}

/**
 * Clear notification history (called on daily cleanup at 5am)
 */
export function clearNotificationHistory() {
    const cleared = notifiedReleases.size;
    notifiedReleases.clear();
    if (cleared > 0) {
        console.log(`✓ Cleared ${cleared} notified release(s) from history`);
    }
}
