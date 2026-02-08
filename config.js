/**
 * Config from environment. Loads .env if present, then reads env vars.
 *
 *   SHOKO_BASE_URL   (default: http://10.0.0.13:8111)
 */

import 'dotenv/config';

const SHOKO_BASE_URL = process.env.SHOKO_BASE_URL;
const SHOKO_API_KEY = process.env.SHOKO_API_KEY;

export { SHOKO_BASE_URL, SHOKO_API_KEY };
