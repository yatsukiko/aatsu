/**
 * Ntfy notification service
 * Sends notifications to ntfy with action buttons
 */

import axios from 'axios';

function getApiBaseUrl() {
    const base = process.env.API_BASE_URL || process.env.APP_BASE_URL || '';
    return String(base).replace(/\/$/, '');
}

/**
 * Send a notification to ntfy with download/ignore action buttons
 */
export async function sendReleaseNotification(episode, release, groupName) {
    try {
        const ntfyUrl = process.env.NTFY_URL;
        if (!ntfyUrl) {
            console.warn('⚠ NTFY_URL not configured, skipping notification');
            return;
        }

        const title = `${release.title}`;
        const message = `Group: ${groupName || 'Unknown'}\nCodec: ${release.codec}\nSize: ${release.fileSize || 'Unknown'}\nSeeders: ${release.seeders}`;

        const apiBaseUrl = getApiBaseUrl();
        const actions = apiBaseUrl
            ? [
                ...(release.magnet && Array.isArray(release.fileList) && release.fileList.length > 0
                    ? [
                        {
                            action: 'http',
                            label: 'Download',
                            url: `${apiBaseUrl}/download`,
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'X-Download-Token': process.env.DOWNLOAD_TOKEN || ''
                            },
                            body: JSON.stringify({
                                magnet: release.magnet,
                                title: release.title,
                                episodeId: episode.shokoEid,
                                fileList: release.fileList
                            }),
                            clear: true
                        }
                    ]
                    : []),
                {
                    action: 'http',
                    label: 'Ignore',
                    url: `${apiBaseUrl}/ignore`,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        releaseId: release.id,
                        title: release.title
                    }),
                    clear: true
                }
            ]
            : null;

        await axios.post(ntfyUrl, message, {
            headers: {
                'Title': title,
                'Tags': 'video,anime',
                'Click': release.url || release.magnet,
                ...(actions ? { 'Actions': JSON.stringify(actions) } : {}),
                'Authorization': process.env.NTFY_AUTH || ''
            }
        });

        console.log(`✓ Ntfy notification sent for ${episode.animeTitle} - Ep ${episode.epNumber}`);
    } catch (error) {
        console.error(`✗ Failed to send ntfy notification:`, error.message);
    }
}

export async function sendSimpleNotification(title, message, clickUrl = '') {
    try {
        const ntfyUrl = process.env.NTFY_URL;
        if (!ntfyUrl) {
            console.warn('⚠ NTFY_URL not configured, skipping notification');
            return;
        }

        const headers = {
            'Title': title,
            'Tags': 'video,anime',
        };
        if (clickUrl) headers['Click'] = clickUrl;
        if (process.env.NTFY_AUTH) headers['Authorization'] = process.env.NTFY_AUTH;

        await axios.post(ntfyUrl, message, { headers });
        console.log(`✓ Ntfy message sent: ${title}`);
    } catch (error) {
        console.error(`✗ Failed to send ntfy message:`, error.message);
    }
}
