/**
 * Episode monitor job
 * Main workflow: get today's episodes, check for releases, schedule periodic checks
 */

import schedule from 'node-schedule';
import * as shokoService from '../services/shokoService.js';
import * as nyaaService from '../services/nyaaService.js';
import { processFoundRelease } from '../services/releaseProcessor.js';

// Map to track scheduled jobs by episode
const scheduledJobs = new Map(); // episodeKey => { jobs: [] }

/**
 * Schedule periodic jobs for monitoring an episode
 * - Every 30 mins: Check RSS for new releases
 * - At 10 PM: Final check via scrape search
 */
async function scheduleEpisodeJobs(episode, epNumber) {
    const episodeKey = `${episode.aniDBAid}-${epNumber}`;

    // Cancel existing jobs for this episode if any
    if (scheduledJobs.has(episodeKey)) {
        const existing = scheduledJobs.get(episodeKey);
        existing.jobs.forEach(job => job.cancel());
        console.log(`✓ Cancelled existing jobs for ${episode.animeTitle} Ep ${epNumber}`);
    }

    const jobs = [];

    // Schedule 30-minute recurring job for RSS checks
    const rssJob = schedule.scheduleJob(`*/30 * * * *`, async () => {
        console.log(`[${new Date().toLocaleTimeString()}] Checking RSS for ${episode.animeTitle} Ep ${epNumber}...`);
        try {
            const rssReleases = await nyaaService.checkRSSForEpisode(episode.animeTitle, epNumber);
            for (const release of rssReleases) {
                await processFoundRelease(episode, release, 'RSS');
            }
        } catch (error) {
            console.error(`✗ RSS check failed:`, error.message);
        }
    });
    jobs.push(rssJob);

    // Schedule 10 PM final check via scrape
    const finalCheckJob = schedule.scheduleJob('0 22 * * *', async () => {
        console.log(`[${new Date().toLocaleTimeString()}] Final check (scrape) for ${episode.animeTitle} Ep ${epNumber}...`);
        try {
            const scrapeReleases = await nyaaService.scrapeForEpisode(episode.animeTitle, epNumber);
            for (const release of scrapeReleases) {
                await processFoundRelease(episode, release, 'Scrape');
            }
        } catch (error) {
            console.error(`✗ Final scrape check failed:`, error.message);
        }
    });
    jobs.push(finalCheckJob);

    scheduledJobs.set(episodeKey, { jobs });
    console.log(`✓ Scheduled jobs for ${episode.animeTitle} Ep ${epNumber} (RSS every 30 min, final check at 22:00)`);
}

/**
 * Get all currently scheduled episode keys
 */
export function getScheduledEpisodes() {
    return Array.from(scheduledJobs.keys());
}

/**
 * Cancel and remove all scheduled episode jobs
 */
export function cleanupAllEpisodeJobs() {
    const episodeKeys = Array.from(scheduledJobs.keys());
    let cancelledCount = 0;

    for (const episodeKey of episodeKeys) {
        const existing = scheduledJobs.get(episodeKey);
        if (!existing?.jobs?.length) {
            scheduledJobs.delete(episodeKey);
            continue;
        }

        existing.jobs.forEach(job => {
            try {
                job.cancel();
                cancelledCount += 1;
            } catch {
                // Ignore cancel errors; proceed with cleanup
            }
        });

        scheduledJobs.delete(episodeKey);
    }

    return { episodeCount: episodeKeys.length, cancelledCount };
}

/**
 * Main check function - runs daily to get and monitor new episodes
 */
export async function checkNyaas() {
    console.log(`\n[${new Date().toLocaleTimeString()}] Starting daily anime check...`);
    
    try {
        // Get today's episodes from Shoko
        const todayEpisodes = await shokoService.getTodayEpisodes(false);
        
        if (todayEpisodes.length === 0) {
            return;
        }

        // Process each episode
        for (const episode of todayEpisodes) {
            console.log(`\n📺 Processing: ${episode.animeTitle} - ${episode.etTitle}`);
            const epNumber = episode.epNumber;

            // Check for releases on RSS and scrape
            try {
                const rssReleases = await nyaaService.checkRSSForEpisode(episode.animeTitle, epNumber);
                const scrapeReleases = await nyaaService.scrapeForEpisode(episode.animeTitle, epNumber);
                
                const allReleases = [...(rssReleases || []), ...(scrapeReleases || [])];
                
                if (allReleases.length > 0) {
                    console.log(`  Found ${allReleases.length} potential release(s)`);
                    
                    // Process each found release (notify if not already notified)
                    for (const release of allReleases) {
                        await processFoundRelease(episode, release, 'Initial');
                    }
                } else {
                    console.log(`  No releases found yet`);
                }
            } catch (error) {
                console.error(`  ✗ Error checking for releases:`, error.message);
            }

            // Schedule recurring jobs to check for this episode
            await scheduleEpisodeJobs(episode, epNumber);
        }

        console.log(`\n✓ Daily check complete\n`);

    } catch (error) {
        console.error(`✗ Fatal error in checkNyaas:`, error.message);
    }
}
