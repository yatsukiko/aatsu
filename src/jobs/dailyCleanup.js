/**
 * Daily cleanup job
 * Runs at 5 AM to remove all scheduled jobs and reset notification history
 */

import schedule from 'node-schedule';
import { getScheduledEpisodes, cleanupAllEpisodeJobs, checkNyaas } from './episodeMonitor.js';
import { clearNotificationHistory } from '../services/releaseProcessor.js';

/**
 * Schedule the daily cleanup job at 5 AM
 */
export function scheduleDailyCleanup() {
    schedule.scheduleJob('0 5 * * *', dailyCleanupAndRestart);
    console.log('✓ Daily cleanup scheduled for 5:00 AM');
}

/**
 * Run cleanup and restart the daily check
 */
async function dailyCleanupAndRestart() {
    console.log(`\n[${new Date().toLocaleTimeString()}] ⚙️  Daily cleanup started (5 AM)...`);
    
    const scheduledEpisodes = getScheduledEpisodes();
    
    if (scheduledEpisodes.length > 0) {
        console.log(`📋 Removing ${scheduledEpisodes.length} scheduled job(s):`);
        scheduledEpisodes.forEach(episodeKey => {
            console.log(`   ✓ Removed: ${episodeKey}`);
        });

        const { episodeCount, cancelledCount } = cleanupAllEpisodeJobs();
        console.log(`✓ Cancelled ${cancelledCount} job(s) for ${episodeCount} episode(s)`);
        
        // Clear notification history for a fresh start
        clearNotificationHistory();
    } else {
        console.log(`ℹ No scheduled jobs to clean up`);
    }

    console.log(`\n🔄 Restarting anime check...\n`);
    await checkNyaas();
}
