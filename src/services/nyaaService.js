/**
 * Nyaa.si service - RSS and web scraping
 * Wraps nyaa lib functions with business logic
 */

import * as nyaa from '../../lib/nyaa.js';

/**
 * Check RSS feed for releases of a specific anime episode
 */
export async function checkRSSForEpisode(animeTitle, epNumber) {
    try {
        const foundAll = await nyaa.findTitleInRSS(animeTitle);
        const matches = foundAll.filter(release => release.episode === epNumber);

        const enhanced = [];
        let currentDelay = 0.2;
        for (let i = 0; i < matches.length; i++) {
            const release = matches[i];
            try {
                const scrapedData = await scrapeWithRetry(release.url, currentDelay);
                enhanced.push({
                    ...release,
                    ...(scrapedData || {}),
                    url: release.url,
                    id: release.id,
                    title: release.title,
                    season: release.season ?? null,
                    episode: release.episode ?? null,
                });
            } catch (e) {
                console.warn(`⚠ Could not scrape data for: ${release.title}, error: ${e}`);
                enhanced.push(release);
            }

            if (i < matches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, currentDelay * 1000));
            }
        }

        return enhanced;
    } catch (error) {
        console.error(`✗ RSS check failed for ${animeTitle}:`, error.message);
        return [];
    }
}

/**
 * Retry a request with exponential backoff on 429 errors
 */
export async function scrapeWithRetry(url, initialDelay = 0.2) {
    let delay = initialDelay;
    while (true) {
        try {
            return await nyaa.scrapeNyaaPage(url);
        } catch (error) {
            if (error.response && error.response.status === 429) {
                delay += 0.5;
                console.warn(`⚠ Rate limited (429). Retrying in ${delay}s...`);
                await new Promise(resolve => setTimeout(resolve, delay * 1000));
            } else {
                throw error;
            }
        }
    }
}

/**
 * Scrape Nyaa search results for an anime and enhance with codec info
 */
export async function scrapeForEpisode(animeTitle, epNumber) {
    try {
        const quickSearch = await nyaa.scrapeSearchResults(animeTitle);

        // Process releases sequentially with adaptive rate limiting (starts at 0.2s)
        const updatedReleases = [];
        let currentDelay = 0.2;

        for (let i = 0; i < quickSearch.length; i++) {
            const release = quickSearch[i];
            try {
                const scrapedData = await scrapeWithRetry(release.url, currentDelay);
                if (!release.codec || release.codec.toLowerCase() === "unknown") {
                    release.codec = scrapedData.codec || release.codec;
                }
                release.fileList = scrapedData.fileList || release.fileList;
            } catch (e) {
                console.warn(`⚠ Could not scrape data for: ${release.title}, error: ${e}`);
            }

            updatedReleases.push(release);

            // Add delay between requests (except after the last one)
            if (i < quickSearch.length - 1) {
                await new Promise(resolve => setTimeout(resolve, currentDelay * 1000));
            }
        }

        return updatedReleases.filter(release => release.episode === epNumber);
    } catch (error) {
        console.error(`✗ Scrape check failed for ${animeTitle}:`, error.message);
        return [];
    }
}
