/**
 * Ntfy notification service
 * Sends notifications to ntfy with action buttons
 */

import axios from 'axios';

function getApiBaseUrl() {
    const base = process.env.API_BASE_URL || process.env.APP_BASE_URL || '';
    return String(base).replace(/\/$/, '');
}

function sanitizeHeaderValue(value) {
    // Node's HTTP client rejects header values containing non-latin1 characters
    // and any CR/LF characters. Keep this conservative.
    let s = value == null ? '' : String(value);
    s = s.replace(/[\r\n]+/g, ' ').trim();

    // Common “smart punctuation” found in release titles.
    s = s
        .replace(/[\u2018\u2019\u2032]/g, "'")
        .replace(/[\u201C\u201D\u2033]/g, '"')
        .replace(/[\u2013\u2014]/g, '-');

    // Drop any remaining non-latin1 characters.
    s = Array.from(s)
        .filter((ch) => ch.charCodeAt(0) === 0x09 || (ch.charCodeAt(0) >= 0x20 && ch.charCodeAt(0) <= 0xFF))
        .join('');

    return s;
}

function jsonStringifyAscii(obj) {
    // Keep JSON header-safe (ASCII-only) while preserving original characters.
    return JSON.stringify(obj).replace(/[\u0080-\uFFFF]/g, (c) => {
        const hex = c.charCodeAt(0).toString(16).padStart(4, '0');
        return `\\u${hex}`;
    });
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

        const title = sanitizeHeaderValue(`${release.title}`);
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
                            body: jsonStringifyAscii({
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
                    body: jsonStringifyAscii({
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
                'Click': sanitizeHeaderValue(release.url || release.magnet),
                ...(actions ? { 'Actions': sanitizeHeaderValue(jsonStringifyAscii(actions)) } : {}),
                ...(process.env.NTFY_AUTH ? { 'Authorization': sanitizeHeaderValue(process.env.NTFY_AUTH) } : {})
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
            'Title': sanitizeHeaderValue(title),
            'Tags': 'video,anime',
        };
        if (clickUrl) headers['Click'] = sanitizeHeaderValue(clickUrl);
        if (process.env.NTFY_AUTH) headers['Authorization'] = sanitizeHeaderValue(process.env.NTFY_AUTH);

        await axios.post(ntfyUrl, message, { headers });
        console.log(`✓ Ntfy message sent: ${title}`);
    } catch (error) {
        console.error(`✗ Failed to send ntfy message:`, error.message);
    }
}
