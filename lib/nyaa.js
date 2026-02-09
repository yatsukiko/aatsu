import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import axios from 'axios';

let parser = new Parser({
    customFields: {
        item: [['nyaa:categoryId', 'categoryId']],
    }
});

const codecAliases = {
    AV1: ["av1"],
    H264: ["h264", "h.264", "h 264", "h/264", "avc", "x264"],
    HEVC: ["h265", "h.265", "h 265", "hevc", "h/265", "x265"],
};



function normalize(str) {
    return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeForMatch(str) {
    return str
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/["'’“”]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function buildMatchTokens(str) {
    const normalized = normalizeForMatch(str);
    return normalized ? normalized.split(" ").filter(Boolean) : [];
}

function tokenMatchFromTokens(queryTokens, candidateTitle) {
    if (!queryTokens.length) return false;
    const candidateTokens = new Set(buildMatchTokens(candidateTitle));
    return queryTokens.every(t => candidateTokens.has(t));
}

function extractSeasonEpisode(title) {
    if (!title) return { season: null, episode: null };

    let season = null;
    let episode = null;

    const matchSE = title.match(/S([0-9]{1,2})E([0-9]{1,3})/i);
    if (matchSE) {
        season = parseInt(matchSE[1], 10);
        episode = parseInt(matchSE[2], 10);
        return {
            season: Number.isNaN(season) ? null : season,
            episode: Number.isNaN(episode) ? null : episode,
        };
    }

    const matchOrdinalSeason = title.match(/(?:^|\s)([0-9]{1,2})(?:st|nd|rd|th)\s+season\b/i);
    const matchSeasonWord = title.match(/\bseason\s*([0-9]{1,2})\b/i);
    const seasonMatch = matchOrdinalSeason || matchSeasonWord;
    if (seasonMatch) {
        const s = parseInt(seasonMatch[1], 10);
        season = Number.isNaN(s) ? null : s;
    }

    const matchEp = title.match(/(?:^|\s|-)0?([1-9][0-9]{0,2})(?=$|\s|\[|\])/);
    if (matchEp) {
        const e = parseInt(matchEp[1], 10);
        if (!Number.isNaN(e) && e !== 1080 && e !== 720 && e !== 2160) {
            episode = e;
        }
    }

    return { season, episode };
}

function detectCodec(title) {
    const normalizedTitle = normalize(title);
    for (const [codec, aliases] of Object.entries(codecAliases)) {
        if (aliases.some(alias => normalizedTitle.includes(normalize(alias)))) {
            return codec;
        }
    }
    return "unknown";
}


export async function findTitleInRSS(animeTitle) {
    animeTitle = animeTitle.replace("(2026)", "")
    let feed = await parser.parseURL('https://nyaa.si/?page=rss');
    let foundEpisodes = []
    const queryTokens = buildMatchTokens(animeTitle);
    feed.items.forEach(item => {
        let lowerCaseTitle = item.title.toLowerCase();
        if (!lowerCaseTitle.includes("1080") || item.categoryId !== "1_2") return;
        if (tokenMatchFromTokens(queryTokens, item.title)) {
            item.codec = detectCodec(lowerCaseTitle);
            const se = extractSeasonEpisode(item.title);
            item.season = se.season;
            item.episode = se.episode;
            delete item.content
            delete item.contentSnippet
            delete item.isoDate
            delete item.link
            item.url = item.guid
            const splitUrl = item.url.split('/');
            item.id = splitUrl[splitUrl.length - 1]
            delete item.guid
            foundEpisodes.push(item);
        }
    });
    return foundEpisodes;
}

export async function scrapeNyaaPage(url) {
    const res = await axios.get(url);
    const html = res.data;

    const $ = cheerio.load(html);

    const magnetNode = $('a[href^="magnet:"]').first();
    const panel = magnetNode.length
        ? magnetNode.closest('div.panel')
        : $('div.panel').has('a[href^="magnet:"]').first();
    const title = panel.find('h3.panel-title').first().text().trim() || $('h3.panel-title').first().text().trim();

    const rows = panel.find('.panel-body .row');
    let date = null;
    let seeders = null;
    let leechers = null;
    let information = null;
    let fileSize = null;

    rows.each((i, el) => {
        const $row = $(el);
        const cols = $row.find('[class*="col-md"]');
        
        // Parse each row which may contain multiple label-value pairs
        for (let j = 0; j < cols.length; j += 2) {
            const label = $(cols[j]).text().trim();
            const valueNode = $(cols[j + 1]);
            if (!label) continue;
            
            if (label === 'Date:') {
                date = valueNode.text().trim();
            } else if (label === 'Seeders:') {
                seeders = valueNode.text().trim();
            } else if (label === 'Leechers:') {
                leechers = valueNode.text().trim();
            } else if (label === 'Information:') {
                const a = valueNode.find('a').first();
                information = a.length ? a.attr('href') : valueNode.text().trim();
            } else if (label === 'File size:') {
                fileSize = valueNode.text().trim();
            }
        }
    });

    const magnet = $('a[href^="magnet:"]').first().attr('href') || null;
    const description = $('#torrent-description').text().trim();

    const codec = detectCodec(description);

    const fileList = [];
    $('.torrent-file-list ul li').each((i, li) => {
        const $li = $(li);
        const size = $li.find('span.file-size').text().trim().replace(/[()]/g, '');
        const name = $li.clone().children('span').remove().end().text().trim();
        fileList.push({ name, size: size || null });
    });

    const seedersNum = seeders ? parseInt(seeders.replace(/[^0-9]/g, ''), 10) : null;
    const leechersNum = leechers ? parseInt(leechers.replace(/[^0-9]/g, ''), 10) : null;

    return {
        title,
        date,
        seeders: seedersNum !== null && !Number.isNaN(seedersNum) ? seedersNum : seeders,
        information,
        leechers: leechersNum !== null && !Number.isNaN(leechersNum) ? leechersNum : leechers,
        fileSize,
        magnet,
        description,
        fileList,
        codec
    };
}

export async function scrapeSearchResults(query) {
    query = query.replace("(2026)", "")
    const url = `https://nyaa.si/?f=0&c=1_2&q=${encodeURIComponent(query)}`;
    const res = await axios.get(url);
    const html = res.data;

    const $ = cheerio.load(html);

    const results = [];

    // Scrape the table rows containing torrent results
    $('table.table tbody tr').each((i, el) => {
        const $row = $(el);
        const cols = $row.find('td');
        
        if (cols.length < 8) return; // Skip rows that don't have enough columns

        // Column structure:
        // 0: Category icon
        // 1: Title (colspan="2")
        // 2: Download buttons
        // 3: File size
        // 4: Date
        // 5: Seeders
        // 6: Leechers
        // 7: Completed

        const titleElement = $row.find('td:nth-child(2) a').first();
        const title = titleElement.text().trim();
        const torrentLink = titleElement.attr('href');
        const { season, episode } = extractSeasonEpisode(title);
        
        // Extract ID from torrent link like /view/2073640
        const torrentId = torrentLink ? torrentLink.split('/').pop() : null;

        const fileSize = $row.find('td:nth-child(4)').text().trim();
        const date = $row.find('td:nth-child(5)').text().trim();
        const seeders = parseInt($row.find('td:nth-child(6)').text().trim()) || 0;
        const leechers = parseInt($row.find('td:nth-child(7)').text().trim()) || 0;
        const completed = parseInt($row.find('td:nth-child(8)').text().trim()) || 0;

        // Get magnet link from download buttons
        const magnetLink = $row.find('td:nth-child(3) a[href^="magnet:"]').attr('href');
        if (!title.toLowerCase().includes("1080")) return;

        if (title) {
            results.push({
                id: torrentId,
                title,
                season: season ? season : null,
                episode: episode ? episode : null,
                fileSize,
                date,
                seeders,
                leechers,
                completed,
                url: torrentLink ? `https://nyaa.si${torrentLink}` : null,
                magnet: magnetLink || null,
                codec: detectCodec(title),
            });
        }
    });
    return results;
}
