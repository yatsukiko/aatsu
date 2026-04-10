/**
 * Shoko Server API v3 client.
 * Used to: (1) get tracked series, (2) check if we already have an episode locally.
 *
 * Verify endpoints at: http://10.0.0.13:8111/swagger/index.html
 * If your Shoko uses auth, set SHOKO_API_KEY or use axios defaults (e.g. apiKey header).
 */

import axios from 'axios';
import { SHOKO_BASE_URL } from '../config.js';

const api = axios.create({
  baseURL: SHOKO_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Optional: Shoko may require an API key or basic auth. Set in env and add to requests.
const SHOKO_API_KEY = process.env.SHOKO_API_KEY;

if (SHOKO_API_KEY) {
  api.defaults.headers.common['apikey'] = SHOKO_API_KEY;
}



export async function linkFileWithEpisode(fileId, episodeIds) {
  try {
    const { data } = await api.post(
        `/api/v3/File/${fileId}/Link`,
        { EpisodeIDs: [episodeIds] },
        {
          headers: {
            'Content-Type': 'application/json-patch+json', // override default
            'Accept': '*/*'
          }
        }
    );

    return data;
  } catch (err) {
    console.error('Failed to link file with episode:', err.response ? err.response.data : err.message);
    return null;
  }
}



export async function findFileByName(fileName) {
  const encodedFileName = encodeURIComponent(fileName);
  try {
    const {data} = await api.get(`/api/v3/File/Search/${encodedFileName}?pageSize=1&page=1&fuzzy=true`)
    return data
  } catch (err) {
    console.error(err)
      return null;

  }

}
/**
 * Get series by AniDB ID.
 * Now returns AniDB anime info with ShokoID field (Shoko series ID, or null if not in Shoko).
 * @param {number} anidbId - AniDB anime id (aid)
 * @returns {Promise<object|null>} AniDB anime info object or null if not found
 */
export async function getSeriesByAniDBId(anidbId) {
  try {
    const { data } = await api.get(`/api/v3/Series/AniDB/${anidbId}`);
    return data;
  } catch (err) {
    if (err.response?.status === 404) return null;
    return null;
  }
}


function toLocalIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function getCalendarEpisodes(showAll = false, numberOfDays = 1) {
  try {
    const start = new Date();
    const end = new Date(start);
    end.setDate(start.getDate() + numberOfDays);

    const startDate = toLocalIsoDate(start);
    const endDate = toLocalIsoDate(end);

    const includeMissing = showAll ? 'True' : 'False';
    const { data } = await api.get('/api/v3/Dashboard/CalendarEpisodes', {
      params: {
        startDate,
        endDate,
        includeMissing,
      },
    });
    return data.map(item => ({
      aniDBEid: item.IDs.ID,
      aniDBAid: item.IDs.Series,
      shokoEid: item.IDs.ShokoEpisode,
      shokoAid: item.IDs.ShokoSeries,
      animeTitle: item.SeriesTitle,
      etTitle: item.Title,
      epNumber: item.Number,
      airDate: item.AirDate,
    }));
  } catch (err) {
    console.error('Failed to get calendar episodes:', err.response?.data || err.message);
    return [];
  }
}

/**
 * Get episodes for a series. Pass the series object or internal Shoko series ID.
 * @param {object|number} ShokoID - Shoko Series ID
 * @returns {Promise<Array>} List of episode objects
 */
export async function getEpisodesForSeries(ShokoID) {
  const id = ShokoID
  if (id == null) return [];

  try {
    const { data } = await api.get(`/api/v3/Series/${id}/Episode?page=1&includeWatched=True&includeManuallyLinked=True&includeDataFrom=AniDB`, { params: { pageSize: 500 } });
    return Array.isArray(data) ? data : data?.List ?? data?.Items ?? [];
  } catch (err) {
    if (err.response?.status === 404) return [];
    throw err;
  }
}

/**
 * Normalize episode number for comparison (string or number).
 */
function epNoMatch(ep, epno) {
  const epStr = String(epno);
  const epNum = Number(epno);
  const val = ep?.AniDB?.EpisodeNumber ?? ep?.IDs?.AniDB;
  if (val === undefined) return false;
  return String(val) === epStr || Number(val) === epNum;
}


/**
 * Check if Shoko already has this episode (we have files for it).
 * Optionally pass anidbEid from AniDB file result to match by AniDB episode ID (more reliable).
 * @param {number} anidbAnimeId - AniDB anime id
 * @param {string|number} epno - Episode number (e.g. 1, "1", "S1")
 * @param {{ anidbEid?: number }} opts - optional AniDB episode id (eid) to match by
 * @returns {{ hasEpisode: boolean, episode?: object, error?: string }}
 */
export async function hasEpisode(anidbAnimeId, epno, opts = {}) {
  try {
    const anidbEid = opts.anidbEid != null ? Number(opts.anidbEid) : null;

    if (anidbEid != null && !Number.isNaN(anidbEid)) {
      try {
        const { data: ep } = await api.get(`/api/v3/Episode/AniDB/${anidbEid}/Episode`, {
          params: { includeFiles: true },
        });
        if (ep) {
          return { hasEpisode: true, episode: ep }
        }
      } catch (err) {
        if (err.response?.status !== 404) throw err;
      }
    }

    const anime = await getSeriesByAniDBId(anidbAnimeId);
    if (!anime) return { hasEpisode: false, error: 'Series not in Shoko' };

    const shokoSeriesId = anime.ShokoID;
    if (!shokoSeriesId) return { hasEpisode: false, error: 'Series not in Shoko (no ShokoID)' };

    const episodes = await getEpisodesForSeries(shokoSeriesId);

    const match = episodes.find((ep) => epNoMatch(ep, epno));
    if (match) return { hasEpisode: true, episode: match };
    return { hasEpisode: false, error: 'Episode not in Shoko' };
  } catch (e) {
    return { hasEpisode: false, error: e.message || String(e) };
  }
}
