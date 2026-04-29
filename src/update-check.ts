import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { request } from 'https';
import { dirname, join } from 'path';
import { getRealHome } from './env.js';

const PACKAGE_NAME = 'brainkeeper';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const NOTICE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 900;

type UpdateCache = {
  checkedAt?: number;
  latest?: string;
  noticeShownAt?: number;
};

export function currentVersion(): string {
  try {
    const raw = readFileSync(new URL('../package.json', import.meta.url), 'utf-8');
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function printVersion(): void {
  console.log(`${PACKAGE_NAME} ${currentVersion()}`);
}

export async function maybePrintUpdateNotice(): Promise<void> {
  if (shouldSkipUpdateCheck()) return;

  const now = Date.now();
  const cachePath = join(getRealHome(), '.sce', 'cache', 'brainkeeper-version.json');
  const cache = readCache(cachePath);
  const current = currentVersion();

  if (cache.latest && isNewer(cache.latest, current)) {
    maybeWriteNotice(cachePath, cache, current, cache.latest, now);
    return;
  }

  if (cache.checkedAt && now - cache.checkedAt < CHECK_INTERVAL_MS) return;

  const latest = await fetchLatestVersion().catch(() => null);
  if (!latest) {
    writeCache(cachePath, { ...cache, checkedAt: now });
    return;
  }

  const nextCache = { ...cache, checkedAt: now, latest };
  writeCache(cachePath, nextCache);
  if (isNewer(latest, current)) maybeWriteNotice(cachePath, nextCache, current, latest, now);
}

function shouldSkipUpdateCheck(): boolean {
  if (!process.stderr.isTTY) return true;
  if (process.env.CI) return true;
  if (process.env.NO_UPDATE_NOTIFIER) return true;
  if (process.env.BRAINKEEPER_NO_UPDATE_CHECK) return true;
  if (process.env.BK_NO_UPDATE_CHECK) return true;
  return false;
}

function readCache(path: string): UpdateCache {
  try {
    if (!existsSync(path)) return {};
    return JSON.parse(readFileSync(path, 'utf-8')) as UpdateCache;
  } catch {
    return {};
  }
}

function writeCache(path: string, cache: UpdateCache): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(cache, null, 2));
  } catch {
    // Update checks must never break the main CLI command.
  }
}

function maybeWriteNotice(path: string, cache: UpdateCache, current: string, latest: string, now: number): void {
  if (cache.noticeShownAt && now - cache.noticeShownAt < NOTICE_INTERVAL_MS) return;
  process.stderr.write([
    '',
    `BrainKeeper update available: ${current} -> ${latest}`,
    '  npm install -g brainkeeper',
    '  or: curl -fsSL https://raw.githubusercontent.com/CtriXin/brainkeeper/main/install.sh | bash -s -- --update',
    '  set BRAINKEEPER_NO_UPDATE_CHECK=1 to hide this check',
    '',
  ].join('\n'));
  writeCache(path, { ...cache, latest, noticeShownAt: now });
}

function fetchLatestVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const req = request(
      {
        hostname: 'registry.npmjs.org',
        path: `/${PACKAGE_NAME}/latest`,
        method: 'GET',
        headers: {
          accept: 'application/json',
          'user-agent': `brainkeeper/${currentVersion()}`,
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
          res.resume();
          resolve(null);
          return;
        }
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => {
          try {
            const data = JSON.parse(raw) as { version?: string };
            resolve(typeof data.version === 'string' ? data.version : null);
          } catch {
            resolve(null);
          }
        });
      },
    );

    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

export function isNewer(candidate: string, current: string): boolean {
  const left = parseSemver(candidate);
  const right = parseSemver(current);
  if (!left || !right) return false;
  for (let i = 0; i < 3; i++) {
    if (left[i] > right[i]) return true;
    if (left[i] < right[i]) return false;
  }
  return false;
}

function parseSemver(value: string): [number, number, number] | null {
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}
