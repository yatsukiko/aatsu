/**
 * Shoko service - Anime library integration
 * Wraps shoko lib functions with business logic
 */

import * as shoko from '../../lib/shoko.js';

/**
 * Get today's airing episodes from Shoko
 */
export async function getTodayEpisodes(showAll = false) {
    try {
        const episodes = await shoko.getAniDBCalendar(showAll, 1);
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

/**
 * Get series info by AniDB ID
 */
export async function getSeriesByAniDBId(anidbId) {
    try {
        return await shoko.getSeriesByAniDBId(anidbId);
    } catch (error) {
        console.error(`✗ Error getting series info for anidb id ${anidbId}:`, error.message);
        return null;
    }
}

/**
 * Get episodes for a series
 */
export async function getSeriesEpisodes(shokoSeriesId) {
    try {
        return await shoko.getEpisodesForSeries(shokoSeriesId);
    } catch (error) {
        console.error(`✗ Error getting episodes for series ${shokoSeriesId}:`, error.message);
        return [];
    }
}
