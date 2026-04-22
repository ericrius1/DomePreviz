import { S3Client } from '@aws-sdk/client-s3';

let _client: S3Client | null = null;

export function r2Client(): S3Client {
  if (_client) return _client;
  const accountId = requireEnv('R2_ACCOUNT_ID');
  const accessKeyId = requireEnv('R2_ACCESS_KEY_ID');
  const secretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY');
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return _client;
}

export function r2Config() {
  return {
    bucket: requireEnv('R2_BUCKET'),
    publicBase: requireEnv('R2_PUBLIC_BASE_URL').replace(/\/$/, ''),
    storageCapGB: Number(process.env.STORAGE_CAP_GB ?? '50'),
  };
}

export const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024; // 10 GB
export const PART_SIZE = 100 * 1024 * 1024;
export const TTL_MS = 3 * 24 * 60 * 60 * 1000;
export const ALLOWED_EXT = new Set(['mp4', 'webm', 'mov', 'm4v', 'jpg', 'jpeg', 'png', 'webp']);
export const ALLOWED_CONTENT_TYPE = /^(video|image)\//;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function timestampPrefix(d = new Date()): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

export function shortId(len = 6): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export function parseKeyTimestamp(key: string): number | null {
  const m = key.match(/videos\/(\d{8})-(\d{6})-/);
  if (!m) return null;
  const [, ymd, hms] = m;
  const y = Number(ymd.slice(0, 4));
  const mo = Number(ymd.slice(4, 6)) - 1;
  const d = Number(ymd.slice(6, 8));
  const h = Number(hms.slice(0, 2));
  const mi = Number(hms.slice(2, 4));
  const s = Number(hms.slice(4, 6));
  return Date.UTC(y, mo, d, h, mi, s);
}

export function extKind(ext: string): 'video' | 'image' | null {
  if (['mp4', 'webm', 'mov', 'm4v'].includes(ext)) return 'video';
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return 'image';
  return null;
}
