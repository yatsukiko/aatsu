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
 * Tries common v3 patterns; adjust if your Swagger shows different paths.
 * @param {number} anidbId - AniDB anime id (aid)
 * @returns {Promise<object|null>} Series object or null if not found / API shape differs
 */
export async function getSeriesByAniDBId(anidbId) {
  try {
    const { data } = await api.get(`/api/v3/Series/AniDB/${anidbId}`);
    const id = getShokoSeriesId(data);
    if (id != null) return data;
    // Direct response had no Shoko series ID; fall back to list and find by AniDB ID
  } catch (err) {
    if (err.response?.status === 404) return null;
  }
  try {
    const { data: list } = await api.get('/api/v3/Series', { params: { pageSize: 5000 } });
    const arr = Array.isArray(list) ? list : list?.List ?? list?.Items ?? [];
    const found = arr.find(
      (s) => s.AniDBID === anidbId || s.IDs?.AniDB === anidbId || (s.IDs && s.IDs.AniDB === anidbId)
    );
    return found ?? null;
  } catch {
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

    // Direct response had no Shoko series ID; fall back to list and find by AniDB ID
  } catch (err) {
    if (err.response?.status === 404) return null;
  }

}

/**
 * Get Shoko series ID from a series object (API shape can vary).
 */
function getShokoSeriesId(series) {
  if (series == null) return null;
  if (typeof series === 'number') return series;
  return (
    series.ID ??
    series.Id ??
    series.IDs?.Shoko ??
    series.IDs?.ShokoSeries ??
    series.ShokoID
  );
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
  const val = ep.AniDB?.EpisodeNumber;
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

    // If we have an AniDB episode ID, prefer the direct endpoint that returns
    // the Shoko episode for that AniDB episode ID. This avoids pulling the
    // whole series episode list and is more reliable.
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
        // 404 = no episode in Shoko for that AniDB EID — fall through to series/epno fallback
      }
    }

    const series = await getSeriesByAniDBId(anidbAnimeId);
    if (!series) return { hasEpisode: false, error: 'Series not in Shoko' };
    const episodes = await getEpisodesForSeries(series.ShokoID);

    const match = episodes.find((ep) => epNoMatch(ep, epno));
    if (match) return { hasEpisode: true, episode: match };
    return { hasEpisode: false, error: 'Episode not in Shoko' };
  } catch (e) {
    return { hasEpisode: false, error: e.message || String(e) };
  }
}
