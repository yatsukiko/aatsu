import express from 'express';
import { qBittorrentClient } from '@robertklep/qbittorrent';
import {findFileByName, linkFileWithEpisode} from "../../lib/shoko.js";
import { sendSimpleNotification } from '../utils/notification.js';

function createQbittorrentClient() {
    const url = process.env.QBITTORRENT_URL;
    const username = process.env.QBITTORRENT_USERNAME;
    const password = process.env.QBITTORRENT_PASSWORD;
    if (!url || !username || !password) {
        throw new Error('qBittorrent not configured (QBITTORRENT_URL, QBITTORRENT_USERNAME, QBITTORRENT_PASSWORD)');
    }
    return new qBittorrentClient(url, username, password);
}

function getExpectedDownloadToken() {
    return process.env.DOWNLOAD_TOKEN || '';
}

function readToken(req) {
    const headerToken = req.headers['x-download-token'];
    const bodyToken = req.body?.token;
    return (headerToken || bodyToken || '').toString();
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export function createDownloadRouter() {
    const router = express.Router();
    router.use(express.json());

    router.post('/download', async (req, res) => {
    // this endpoint will always receive a single episode.
    // Implements polling + retries:
    // - Poll Shoko every 30s until the file appears
    // - If file is in ImportFolderID === 2, poll every 60s until it changes
    // - Retry linking until it succeeds (poll every 30s)

    const body = req.body || {};

    // Simple token auth for public exposure
    const token = readToken(req);
    const expectedToken = getExpectedDownloadToken();
    if (!expectedToken) {
        console.warn('DOWNLOAD_TOKEN not configured; rejecting public download requests');
        return res.status(503).json({ error: 'Server not configured for public downloads' });
    }
    if (!token || token !== expectedToken) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!body.magnet || !Array.isArray(body.fileList) || body.fileList.length === 0 || !body.episodeId) {
        return res.status(400).json({ error: 'Missing required fields: magnet, fileList, episodeId' });
    }

    // Add magnet to download
    try {
        const client = createQbittorrentClient();
        const qRes = await client.torrents.add(body.magnet);
        if (qRes === "Fails.") {
            console.warn('Failed to add magnet to qBittorrent" ' + qRes);
            return res.status(400).json({ error: 'Failed to add magnet to qBittorrent' });
        }
    } catch (err) {
        console.error('Error adding magnet to qBittorrent:', err.message || err);
        return res.status(502).json({ error: 'Failed to add magnet to qBittorrent' });
    }

    const file = body.fileList[0];

    async function pollForFile(fileName, intervalMs = 30000) {
        while (true) {
            try {
                const info = await findFileByName(fileName);
                if (info && info.List && info.List.length > 0) {
                    return info;
                }
            } catch (err) {
                console.warn('Error while querying Shoko for file:', err.message || err);
            }
            console.log(`File ${fileName} not found in Shoko, retrying in ${intervalMs / 1000}s...`);
            await sleep(intervalMs);
        }
    }

    async function waitForImportFolderLink(fileInfo, checkIntervalMs = 60000, maxWaitMs = 120000) {
        // If ImportFolderID === 2 it means it's in Shoko's temporary import folder.
        // We cannot reliably detect when Shoko finishes processing, so wait up to
        // `maxWaitMs` total. If still in ImportFolderID === 2 after that, return
        // so the caller can attempt manual linking.
        let info = fileInfo;
        let elapsed = 0;
        while (true) {
            const loc = info?.List?.[0]?.Locations?.[0];
            if (!loc) return info; // nothing we can do
            if (loc.ImportFolderID !== 2) return info; // ready for manual linking or already linked

            if (elapsed >= maxWaitMs) {
                console.log(`ImportFolderID still 2 after ${elapsed}ms, proceeding to manual linking.`);
                return info;
            }

            console.log(`File is in ImportFolderID=2 (waiting to be linked). Re-checking in ${checkIntervalMs / 1000}s...`);
            await sleep(checkIntervalMs);
            elapsed += checkIntervalMs;
            try {
                info = await findFileByName(info.List[0].Name || info.List[0].Locations[0].RelativePath);
            } catch (err) {
                console.warn('Error while re-querying Shoko for import status:', err.message || err);
            }
        }
    }

    async function ensureLinked(fileId, episodeId, fileInfo, retryIntervalMs = 30000) {
        if (fileInfo.List?.[0]?.Locations?.[0]?.ImportFolderID !== 2){
            console.log("Already linked")
            return true;
        }
        while (true) {
            try {
                const linkResult = await linkFileWithEpisode(fileId, episodeId);
                if (!linkResult || linkResult.length === 0) {
                    console.log(`Successfully linked file ${fileId} to episode ${episodeId}`);
                    return true;
                }
                console.warn(`Linking returned error, retrying in ${retryIntervalMs / 1000}s:`, linkResult);
            } catch (err) {
                console.warn('Error while attempting to link file with episode:', err.message || err);
            }
            await sleep(retryIntervalMs);
        }
    }

    try {
        // Poll for the file to appear in Shoko
        let fileInfo = await pollForFile(file.name, 30000);

        const fileName = fileInfo?.List?.[0]?.Locations?.[0]?.RelativePath;
        if (!fileName) {
            console.warn('File found but no location data; returning 202');
            return res.status(202).json({ message: 'File found but no location data yet' });
        }

        if (file.name !== fileName) {
            console.warn(`Downloaded file name mismatch (expected: ${file.name}, found: ${fileName}). Waiting until Shoko reports the correct file or marks it imported.`);

            // Wait until either:`
            // - Shoko's reported relative path includes the expected filename, or
            // - ImportFolderID becomes 1 (meaning Shoko imported/linked it)
            async function waitForMatchingFileOrImported(expectedName, intervalMs = 30000, maxWaitMs = 300000) {
                let waited = 0;
                while (waited <= maxWaitMs) {
                    try {
                        const info = await findFileByName(expectedName);
                        const loc = info?.List?.[0]?.Locations?.[0];
                        const rel = loc?.RelativePath;
                        if (rel && rel.includes(expectedName)) return info;
                    } catch (err) {
                        console.warn('Error while checking for matching filename/import status in Shoko:', err.message || err);
                    }
                    console.log(`Expected file ${expectedName} not yet present/matched/imported in Shoko, retrying in ${intervalMs / 1000}s...`);
                    await sleep(intervalMs);
                    waited += intervalMs;
                }
                // timed out — return latest known result (may be null)
                return await findFileByName(expectedName);
            }

            const matchedInfo = await waitForMatchingFileOrImported(file.name, 30000, 300000);
            fileInfo = matchedInfo || fileInfo;
        }

        // If the file is waiting to be linked (ImportFolderID === 2), wait until it's ready
        const updatedInfo = await waitForImportFolderLink(fileInfo, 60000);

        const fileId = updatedInfo?.List?.[0]?.ID;
        if (!fileId) {
            console.error('No file ID available to link.');
            return res.status(500).json({ error: 'No file ID available to link' });
        }

        // Keep retrying the linking operation until it succeeds
        const linked = await ensureLinked(fileId, body.episodeId, updatedInfo, 30000);

        // Notify that file has been linked and is waiting for import
        try {
            const episodeTitle = body.title || `Episode ${body.episodeId}`;
            await sendSimpleNotification(
                `Episode ${episodeTitle} downloaded`,
                `Episode ${episodeTitle} has been downloaded, waiting for import.`,
                ''
            );
        } catch (nerr) {
            console.warn('Failed to send post-download notification:', nerr.message || nerr);
        }

        // Now poll until ImportFolderID indicates import completed (assume ImportFolderID === 1 means imported)
        try {
            let finalInfo = updatedInfo;
            const maxChecks = 60; // avoid infinite loop: ~60 minutes by default
            let checks = 0;
            while (checks < maxChecks) {
                const loc = finalInfo?.List?.[0]?.Locations?.[0];
                if (loc && loc.ImportFolderID === 1) {
                    // Imported
                    const episodeTitle = body.title || `Episode ${body.episodeId}`;
                    await sendSimpleNotification(
                        `Episode ${episodeTitle} imported`,
                        `Episode ${episodeTitle} has been successfully imported.`,
                        ''
                    );
                    break;
                }
                await sleep(60000); // wait 60s between checks
                try {
                    finalInfo = await findFileByName(finalInfo.List[0].Name || finalInfo.List[0].Locations[0].RelativePath);
                } catch (err) {
                    console.warn('Error while polling for import completion:', err.message || err);
                }
                checks++;
            }
        } catch (nerr) {
            console.warn('Import completion polling failed:', nerr.message || nerr);
        }

    } catch (e) {
        console.error('Unexpected error in /download handler:', e);
        return res.status(500).json({ error: e.message || String(e) });
    }

    return res.status(200).json({ message: 'Download processed; linking queued/attempted' });

    });

    router.post('/ignore', (req, res) => {
        const body = req.body || {};
        const releaseId = body.releaseId || '';
        const title = body.title || '';
        console.log(`Ignoring release${releaseId ? ` ${releaseId}` : ''}${title ? `: ${title}` : ''}`);
        return res.status(200).json({ ok: true });
    });

    return router;
}
