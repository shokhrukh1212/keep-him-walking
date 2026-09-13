# Cloudflare R2 asset hosting

The product works with `ASSET_BASE_URL` empty: the application origin serves the checked-in assets, and place renditions already carry year-long immutable caching (`next.config.ts` headers). No bucket or credentials are needed for local development. R2 is the chosen production host (DECISIONS, 12 September 2026); what the owner still has to do is AFTER-P22 **D8**.

## What is uploaded, and how it is cached

`pnpm assets:upload` is a dry run by default. It inventories runtime files under `public/characters`, `public/scenes`, `public/audio` and `public/npcs`, including character credits. Public URL paths and bucket keys match, e.g. `/scenes/paris/v2/places/paris-arrival/city-full-2560.fe745ffe8d.webp` → `scenes/paris/v2/places/paris-arrival/city-full-2560.fe745ffe8d.webp`. All retained versions are included because review and rollback packs still reference them.

- **Allowed files:** GLB, WebP, PNG, JPEG, WAV, MP3, OGG and Markdown credits. Hidden files, authoring formats and other public directories are excluded.
- **Refused:** symlinks cause a preflight error, and files above 100 MiB are rejected before any upload.
- **Never deleted:** the command never deletes remote objects or local files.
- **Replaced:** `--upload` PUTs every key, replacing an existing object at the same key; rerunning completes a partial upload.
- **No new dependencies.**

Cache headers:

| Key | `Cache-Control` |
|---|---|
| Content-hashed (`name.<10 hex>.ext`) — every place rendition from `pnpm scenes:build` | `public, max-age=31536000, immutable` |
| Anything else (character revisions, legacy zone files, audio) | `public, max-age=3600` |

Options:

- `--prefix scenes/paris/v3` uploads one tree only (it must be inside the four roots).
- `--skip-existing` sends a HEAD for each key to `ASSET_BASE_URL` and skips files already served there. It requires `ASSET_BASE_URL`.

## Owner setup before activation

1. **Bucket and token.** Create an R2 bucket, e.g. `keep-him-walking-assets`, and an R2 API token with **Object Read & Write** on that bucket only. Put the S3 endpoint, access-key ID and secret in private `.env.local`. Never send credentials in chat or commit them. The application itself never needs these credentials.

   ```dotenv
   ASSET_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
   ASSET_S3_BUCKET=keep-him-walking-assets
   ASSET_S3_REGION=auto
   ASSET_S3_ACCESS_KEY_ID=
   ASSET_S3_SECRET_ACCESS_KEY=
   ```

   The shorter Cloudflare names `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID` and
   `R2_SECRET_ACCESS_KEY` are accepted aliases. `R2_ACCOUNT_ID` is informational when
   the full endpoint is present.

2. **Custom domain.** In the bucket's **Settings → Custom Domains**, connect `assets.keephimwalking.com`. Use the custom domain, not `r2.dev`: the `r2.dev` address is rate-limited and bypasses Cloudflare's cache. The public domain is different from the authenticated S3 endpoint.

3. **CORS.** WebGL textures and canvas capture need it even though the files open in a browser tab. In **Settings → CORS policy**, add this read-only rule, and add explicit Preview origins if you use them:

   ```json
   [
     {
       "AllowedOrigins": ["https://keephimwalking.com", "https://www.keephimwalking.com", "http://localhost:3100"],
       "AllowedMethods": ["GET", "HEAD"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag", "Content-Length"],
       "MaxAgeSeconds": 86400
     }
   ]
   ```

   These assets are public, so `"AllowedOrigins": ["*"]` is also acceptable if Preview URLs are inconvenient. Never enable writes or credentials.

4. **Upload.** Inventory first, then upload:

   ```sh
   pnpm assets:upload                      # dry run: count, bytes, roots
   pnpm assets:upload --upload             # everything
   pnpm assets:upload --upload --prefix scenes/paris/v3 --skip-existing   # a new pack version only
   ```

   The report shows file count, bytes, roots, uploaded and skipped, never credentials. Uploads use S3 Signature V4, correct MIME types and a 30-second request timeout, and reject redirects. Errors name the key and status plus the successful-upload count, never remote response bodies or signed headers. An authentication failure stops the run.

5. **Verify, without credentials.**

   ```sh
   pnpm assets:verify --pack paris-v3 --base https://assets.keephimwalking.com --origin https://keephimwalking.com
   ```

   For every rendition in the pack's manifest it checks:
   - status 200
   - the image MIME type
   - the immutable cache header
   - `Access-Control-Allow-Origin` for the given origin
   - the byte count against the local file

   It exits non-zero on any failure and prints the failures. No real upload or CORS success is claimed until this reports `"failed": 0` against the owner's bucket. Check a character GLB and an audio file by hand as well:

   ```sh
   curl -I -H 'Origin: https://keephimwalking.com' https://assets.keephimwalking.com/characters/v3/traveler.glb
   ```

6. **Activate.** Set `ASSET_BASE_URL` to the public HTTPS **origin only** in Vercel (Production and Preview), then rebuild and redeploy. `next.config.ts` exposes only this non-secret origin to client loaders, as `NEXT_PUBLIC_ASSET_BASE_URL`. Path prefixes, credentials, queries and fragments are rejected. Changing the variable without rebuilding does not update the browser bundle.

## Manual product check and rollback

With the base empty, open `/`: scene images request same-origin `/scenes/.../places/...` paths, and only the current place (plus the next one in its last 45 walking seconds) is fetched.

With a verified host and a new build:
- GLBs, renditions and ambience request that host.
- A place change shows no CORS error.
- `.pixi-scene[data-scene-asset-state]` reads `ready`.

If the CDN fails for a painting, the world keeps the last good painting and retries (2 s, 5 s, 15 s, then every 30 s). A traveler already walking is not reset.

To roll back hosting, clear `ASSET_BASE_URL` and rebuild/redeploy. Local copies are retained. This is a configuration fallback, not an automatic switch to the application origin during an outage.

Sources checked: [Cloudflare R2 S3 setup](https://developers.cloudflare.com/r2/get-started/s3/), [R2 public buckets and custom domains](https://developers.cloudflare.com/r2/buckets/public-buckets/), [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/), [R2 upload limits](https://developers.cloudflare.com/r2/objects/upload-objects/) and [AWS Signature V4 request construction](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html).
