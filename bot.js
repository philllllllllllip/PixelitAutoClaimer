import dotenv from 'dotenv';

dotenv.config({ override: true });

const USERNAME = process.env.IZUMII_USERNAME || process.env.USERNAME;
const PASSWORD = process.env.IZUMII_PASSWORD || process.env.PASSWORD;
const {
  SITE_URL = 'https://izumiihd.xyz',
  POLL_INTERVAL_MS = '30000',
  MAX_WAIT_MS = `${1000 * 60 * 60 * 6}`
} = process.env;

if (!USERNAME || !PASSWORD) {
  console.error('Missing IZUMII_USERNAME/IZUMII_PASSWORD in .env.');
  process.exit(1);
}

const baseUrl = SITE_URL.replace(/\/$/, '');
const LOGIN_PAGE = `${baseUrl}/login`;
const LOGIN_API = `${baseUrl}/api/login`;
const USER_API = `${baseUrl}/api/user`;
const DAILY_WHEEL_API = `${baseUrl}/api/user/daily-wheel`;
const DAILY_WHEEL_COOLDOWN_MS = 1000 * 60 * 60 * 4;

const pollIntervalMs = Number(POLL_INTERVAL_MS) || 30000;
const maxWaitMs = Number(MAX_WAIT_MS) || 1000 * 60 * 60 * 6;

const defaultHeaders = {
  Accept: 'application/json, text/plain, */*',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Origin: baseUrl,
  Referer: LOGIN_PAGE
};

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  setFromResponse(response) {
    const rawCookies = [];
    if (typeof response.headers.getSetCookie === 'function') {
      rawCookies.push(...response.headers.getSetCookie());
    } else {
      const setCookieHeader = response.headers.get('set-cookie');
      if (setCookieHeader) {
        rawCookies.push(...String(setCookieHeader).split(/,(?=[^\s][^=]+=)/));
      }
    }

    for (const rawCookie of rawCookies) {
      const [pair] = rawCookie.split(/;\s*/);
      if (!pair) continue;
      const separatorIndex = pair.indexOf('=');
      if (separatorIndex <= 0) continue;
      const name = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();
      if (name && value !== undefined) {
        this.cookies.set(name, value);
      }
    }
  }

  getCookieHeader() {
    const cookiePairs = [];
    for (const [name, value] of this.cookies.entries()) {
      cookiePairs.push(`${name}=${value}`);
    }
    return cookiePairs.join('; ');
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDuration(ms) {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${hours}h ${minutes}m ${seconds}s`;
}

const cookieJar = new CookieJar();

async function fetchWithCookie(url, opts = {}) {
  const headers = new Headers(opts.headers || {});
  const cookieHeader = cookieJar.getCookieHeader();
  if (cookieHeader) {
    headers.set('Cookie', cookieHeader);
  }

  const response = await fetch(url, {
    ...opts,
    headers,
    redirect: 'manual'
  });

  cookieJar.setFromResponse(response);
  return response;
}

async function login() {
  console.log('Logging in...');

  await fetchWithCookie(LOGIN_PAGE, {
    method: 'GET',
    headers: {
      Accept: 'text/html, application/xhtml+xml, application/xml; q=0.9, */*; q=0.8',
      'User-Agent': defaultHeaders['User-Agent'],
      Referer: baseUrl
    }
  });

  const response = await fetchWithCookie(LOGIN_API, {
    method: 'POST',
    headers: {
      ...defaultHeaders,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD })
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.error || data?.message || `Login failed (${response.status})`;
    throw new Error(message);
  }

  console.log('Login successful.');
  return data;
}

async function getUser() {
  const response = await fetchWithCookie(USER_API, {
    method: 'GET',
    headers: {
      ...defaultHeaders,
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user data (${response.status})`);
  }

  return response.json();
}

async function claimDailyWheel() {
  const response = await fetchWithCookie(DAILY_WHEEL_API, {
    method: 'POST',
    headers: {
      ...defaultHeaders,
      'Content-Type': 'application/json'
    }
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || `Daily wheel claim failed (${response.status})`);
  }

  return data;
}

async function run() {
  try {
    await login();

    const start = Date.now();
    while (true) {
      const user = await getUser();
      const lastClaim = user?.lastClaim ? new Date(user.lastClaim).getTime() : 0;
      const now = Date.now();
      const nextClaimTime = lastClaim ? lastClaim + DAILY_WHEEL_COOLDOWN_MS : 0;
      const canClaim = !lastClaim || now >= nextClaimTime;

      if (canClaim) {
        console.log('Daily wheel is ready. Claiming now...');
        const result = await claimDailyWheel();
        console.log('Claim successful!');
        console.log(`Reward: ${result?.reward ?? 'unknown'} tokens`);
        console.log(`Total tokens: ${result?.tokens ?? user?.tokens ?? 'unknown'}`);
        break;
      }

      const remaining = nextClaimTime - now;
      console.log(`Daily wheel not ready yet. Next claim in ${formatDuration(remaining)} (${new Date(nextClaimTime).toISOString()})`);

      if (Date.now() - start > maxWaitMs) {
        console.log('Max wait time reached. Exiting without claiming.');
        break;
      }

      const waitMs = Math.min(remaining, pollIntervalMs);
      await sleep(waitMs > 0 ? waitMs : pollIntervalMs);
    }
  } catch (error) {
    console.error('Bot error:', error.message || error);
    process.exitCode = 1;
  }
}

run();
