/**
 * Main entry point for the anime release tracker
 * Initializes the daily check job and cleanup schedule
 */

import express from 'express';
import http from 'http';
import { checkNyaas, cleanupAllEpisodeJobs } from './jobs/episodeMonitor.js';
import { scheduleDailyCleanup } from './jobs/dailyCleanup.js';
import { createDownloadRouter } from './http/downloadRouter.js';

let server = null;

async function start() {
    console.log('🚀 Anime Release Tracker starting...\n');

    const app = express();
    app.get('/health', (req, res) => res.status(200).json({ ok: true }));
    app.use(createDownloadRouter());

    const port = Number(process.env.PORT || 3000);
    server = app.listen(port, () => {
        console.log(`✓ API server listening on port ${port}`);
    });

    // Schedule the daily cleanup (5 AM)
    scheduleDailyCleanup();

    // Run initial check
    await checkNyaas();

    console.log('✓ Tracker initialized and running\n');
}

async function shutdown() {
    console.log('\nShutting down gracefully...');

    // Cancel all scheduled episode monitoring jobs
    const { episodeCount, cancelledCount } = cleanupAllEpisodeJobs();
    console.log(`  Cancelled ${cancelledCount} episode job(s) across ${episodeCount} episode(s)`);

    // Close HTTP server (stop accepting new connections)
    if (server) {
        await new Promise((resolve) => {
            server.close(() => {
                console.log('  HTTP server closed');
                resolve();
            });
        });
    }

    console.log('  Shutdown complete');
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start().catch(err => {
    console.error('Fatal error during startup:', err && err.message ? err.message : err);
    shutdown();
});
