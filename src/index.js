/**
 * Main entry point for the anime release tracker
 * Initializes the daily check job and cleanup schedule
 */

import express from 'express';
import { checkNyaas } from './jobs/episodeMonitor.js';
import { scheduleDailyCleanup } from './jobs/dailyCleanup.js';
import { createDownloadRouter } from './http/downloadRouter.js';

async function start() {
    console.log('🚀 Anime Release Tracker starting...\n');

    const app = express();
    app.get('/health', (req, res) => res.status(200).json({ ok: true }));
    app.use(createDownloadRouter());

    const port = Number(process.env.PORT || 3000);
    app.listen(port, () => {
        console.log(`✓ API server listening on port ${port}`);
    });

    // Schedule the daily cleanup (5 AM)
    scheduleDailyCleanup();

    // Run initial check
    await checkNyaas();

    console.log('✓ Tracker initialized and running\n');
}

function shutdown() {
    console.log('\nShutting down gracefully...');
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start().catch(err => {
    console.error('Fatal error during startup:', err && err.message ? err.message : err);
    shutdown();
});
