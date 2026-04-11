/**
 * Shoko service - Anime library integration
 * Wraps shoko lib functions with business logic
 */

import * as shoko from '../../lib/shoko.js';

/**
 * Get today's airing episodes from Shoko
 * Queries yesterday+today to handle timezone differences (JST releases may appear day early on nyaa)
 */
export async function getTodayEpisodes(showAll = false) {
    try {
        const episodes = await shoko.getCalendarEpisodes(showAll, 1);
        if (!episodes || episodes.length === 0) {
            console.log('ℹ No anime releases scheduled for today');
            return [];
        }

        console.log(`✓ Found ${episodes.length} episode(s) airing today`);
        return episodes;
    } catch (error) {
        console.error('✗ Error getting today episodes from Shoko:', error.message);
        return [];
    }
}
