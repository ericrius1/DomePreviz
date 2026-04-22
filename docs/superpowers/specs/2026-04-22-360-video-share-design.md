# 360 Video Upload + Share Design

**Date:** 2026-04-22
**Status:** Approved, implementing

## Goal

Let any visitor upload a 360 video (up to ~10 GB, with sound) through the existing dome previz site, get back a share URL, and have recipients view the video through a minimal in-app player. Videos auto-expire after 3 days.

## Non-goals

- Authentication / user accounts
- Resumable uploads (retry whole upload on failure)
- Transcoding / format conversion (serve the raw mp4)
- Custom domain on the R2 bucket (v1 ships on `pub-xxx.r2.dev`)

## Architecture

```
┌────────────────────────┐       ┌─────────────────────────┐
│  Browser (Vite SPA)    │       │  Vercel Serverless API  │
│  - Video360 viewer     │──────▶│  /api/upload/init       │
│  - "Share" button      │       │  /api/upload/complete   │
│  - Adapts to /v/{id}   │       │  /api/resolve           │
└────────────┬───────────┘       │  /api/cleanup (cron)    │
             │                   └──────────┬──────────────┘
             │ direct PUT per part          │ presign URLs,
             │                              │ evict, resolve
             └──────────────┬───────────────┘
                            ▼
                  ┌─────────────────────┐
                  │  Cloudflare R2      │
                  │  videos/{ts}-{id}.ext│
                  └─────────────────────┘
```

Two services only: Vercel (hosting + serverless) and Cloudflare R2 (object storage). No database. No Redis.

## Storage & naming

- Single R2 bucket, public access via `pub-xxx.r2.dev`.
- Object key: `videos/{yyyymmdd-hhmmss}-{shortid}.{ext}` (shortid = 6 URL-safe chars).
- Lex order = chronological order, so LRU eviction is a single `ListObjectsV2` call.
- Share URL: `https://<host>/v/{shortid}`. The viewer hits `/api/resolve?id={shortid}` which list-scans the bucket prefix and returns the public URL of the matching key, or 404.

## Upload flow

Client-side multipart because R2's single-PUT cap is 5 GB and we need 10 GB.

1. User drops a file → loads locally (existing behavior, unchanged).
2. User clicks "Share" in Tweakpane.
3. Browser splits file into ~100 MB parts (≤100 parts at 10 GB).
4. `POST /api/upload/init` with `{ size, contentType, ext, partCount }`.
5. Server: validates size (≤10 GB), content type (`video/*` or `image/*`), and `partCount == ceil(size / 100 MB)`. Runs LRU eviction if `total + size > STORAGE_CAP_GB`. Calls `CreateMultipartUpload` on R2, presigns one `UploadPart` URL per part (1-hour expiry), returns `{ shortid, key, uploadId, partUrls[] }`.
6. Browser uploads parts in parallel (4 at a time), collecting each `ETag`. UI shows progress.
7. `POST /api/upload/complete` with `{ key, uploadId, parts: [{PartNumber, ETag}] }`. Server calls `CompleteMultipartUpload`, returns `{ shareUrl }`.
8. On any part failure: retry 3× with backoff, then `AbortMultipartUpload` and surface error.

## Viewer

The main page adapts to a `/v/{shortid}` URL by:
- Hiding drag-drop / dropzone chrome.
- Hiding the Share button.
- Hiding Tweakpane except minimal playback controls.
- Calling `/api/resolve` and autoloading the result.
- On 404: showing "Video not found or expired."

No separate `viewer.html`. One entry point.

## Cost control

- `STORAGE_CAP_GB` env var (default 50 GB). On every upload, list bucket; if sum + incoming > cap, delete oldest keys until it fits.
- `/api/cleanup` cron (daily in `vercel.json`) deletes any key with a timestamp prefix older than 3 days.
- R2 egress is free, so bandwidth is not a cost axis.
- No rate limiting in v1. The storage cap alone bounds cost: max monthly bill = `STORAGE_CAP_GB × $0.015`. Abusers can only evict their own garbage.
- Future add (not in v1): Cloudflare Turnstile CAPTCHA on `/api/upload/init` if bots become a problem.

## Simplification of existing app

The dome previz app today has 4+ template modes. This work removes everything except 360 video/image.

**Delete:**
- `src/templates/aurora/` (directory)
- `src/templates/PlanetariumTemplate.ts`
- `src/templates/TerrainSunsetTemplate.ts`
- `src/templates/NullTemplate.ts`
- `src/templates/registry.ts`
- `src/templates/Template.ts`
- Audio modules tied to non-video templates (keep `Video360Audio.ts`)

**Keep:**
- Dome-master fisheye preview (core to "previz")
- Camera modes: orbit, first-person, WebXR/VR
- `Video360Template` (flattened — no longer needs to conform to a `Template` interface)
- Audio bus only if `Video360Audio` needs it; otherwise inlined

**Modify:**
- `src/main.ts` — drop template registry; always boot Video360 mode. Detect `/v/{id}` → autoload + hide upload UI.
- `src/ui/TweakpaneUI.ts` — remove template switcher; add Share button + progress/URL display.
- `src/types.ts` — drop `Template`, `TemplateRegistry`, `TemplateAction` if only used by removed code.

## Env vars

| Var | Purpose |
|---|---|
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 API token ID |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret |
| `R2_BUCKET` | Bucket name |
| `R2_PUBLIC_BASE_URL` | `https://pub-xxx.r2.dev` |
| `STORAGE_CAP_GB` | Hard cap, default 50 |
| `CRON_SECRET` | Shared secret Vercel Cron sends in `Authorization` header |

## Files to add

| Path | Purpose |
|---|---|
| `api/upload/init.ts` | Mint presigned multipart URLs, run LRU eviction |
| `api/upload/complete.ts` | Finalize multipart upload |
| `api/resolve.ts` | shortid → public R2 URL, or 404 |
| `api/cleanup.ts` | Cron: delete blobs older than 3 days |
| `src/share/uploader.ts` | Client multipart orchestration |
| `src/share/shareUI.ts` | Share button, progress, copy URL |
| `vercel.json` | Rewrites `/v/:id` → `/`, cron schedule |
| `.env.example` | Document env vars |

## Dependencies to add

- `@aws-sdk/client-s3` (server only)
- `@aws-sdk/s3-request-presigner` (server only)
- `nanoid` (server only, for shortids)

## Error handling

- Upload init rejected (size/type): inline error under Share button.
- Part upload fails: 3 retries with backoff, then abort + error.
- Complete fails: abort + error.
- Resolve 404: viewer shows friendly "not found or expired."
- R2 misconfigured: 500 from server, visible in Vercel logs.

## Out of scope for v1

- Resumable uploads (Tus / resume from listed parts)
- CAPTCHA / anti-abuse
- Custom R2 domain
- Admin UI for manual deletion
- Per-IP rate limiting
