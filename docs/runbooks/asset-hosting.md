# Optional R2 asset hosting

The product works with `ASSET_BASE_URL` empty. This serves the checked-in assets from the application origin. No bucket or credentials are needed for local development. This runbook implements the owner's Q13 decision; other P18 work is still planned.

## What the command uploads

`pnpm assets:upload` is a dry run by default. It inventories runtime files under `public/characters`, `public/scenes`, `public/audio` and `public/npcs`, including character credits. Public URL paths and bucket keys match, e.g. `/characters/v2/traveler.glb` → `characters/v2/traveler.glb`. All currently retained versions are included because review/legacy packs still reference them.

Allowed files: GLB, WebP, PNG, JPEG, WAV, MP3, OGG and Markdown credits. Hidden files, authoring formats and other public directories are excluded. Symlinks cause a preflight error. The command never deletes remote objects or local files. An explicit `--upload` PUTs these keys, replacing an existing object at the same key; rerunning completes a partial upload. Files above 100 MiB are rejected before upload. There are no new dependencies.

## Owner setup before activation

1. Create an R2 bucket and a bucket-scoped **Object Read & Write** S3 token. Copy the S3 endpoint, access-key ID and secret into private `.env.local` or a secret environment. Do not send credentials in chat or commit them. The application does not need these upload credentials.
2. Connect a public asset domain to the bucket, for example `https://assets.keephimwalking.lol`. The public domain is different from the authenticated S3 endpoint.
3. Set bucket CORS for browser `GET` and `HEAD` requests from the product origin, explicit Preview origins and any local origins used with the CDN. Expose `ETag`; allow `Range` if needed for media. These assets are public, so an `AllowedOrigins: ["*"]` read-only policy is also valid if explicit Preview URLs are inconvenient. Do not enable browser writes or credentials. CORS is required by WebGL textures and canvas, even if a URL opens in a browser tab.
4. Configure these private upload variables:

```dotenv
ASSET_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
ASSET_S3_BUCKET=keep-him-walking-assets
ASSET_S3_REGION=auto
ASSET_S3_ACCESS_KEY_ID=
ASSET_S3_SECRET_ACCESS_KEY=
```

5. Run the inventory, then upload when its scope is correct:

```sh
pnpm assets:upload
pnpm assets:upload --upload
```

The command reports file count, bytes, roots and number uploaded, without credentials. Uploads use S3 Signature V4, correct MIME types, a 30-second request timeout, and reject redirects. Errors identify the key/status and successful-upload count, not remote response bodies or signed headers. Authentication failures stop the run. Existing keys receive `Cache-Control: public, max-age=3600`; the current character revision URLs can still be repaired in place, so they are not marked immutable.

6. Check actual host responses and CORS before activation. A credential-free example, substituting the real host:

```sh
curl -I -H 'Origin: https://keephimwalking.lol' https://assets.keephimwalking.lol/characters/v2/traveler.glb
```

Confirm status 200, GLB MIME, cache header and `Access-Control-Allow-Origin`; check a scene image and audio file too. Compare the object byte sizes to local files. No real upload/CORS success is claimed until these checks pass against the owner's bucket.

7. Set `ASSET_BASE_URL` to the public HTTPS **origin only**, then rebuild/redeploy. `next.config.ts` exposes only this non-secret origin to client loaders as `NEXT_PUBLIC_ASSET_BASE_URL`. Path prefixes, credentials, queries and fragments are rejected. Changing the server variable after building does not update the browser bundle.

## Manual product check and rollback

With the base empty, open `/` and `/preview/characters`: assets should request same-origin paths. With a populated, verified host and a new build, confirm GLBs, scene images and ambience request that host, both review candidates load and zone changes have no CORS errors. Character motion and journey authority are unchanged. Pack preview CDN images bypass the Next image proxy; local images retain existing optimization. Original `/traveler/` reference/fallback assets, sponsor creative and generated postcards retain their existing URLs.

To roll back hosting, empty `ASSET_BASE_URL` and rebuild/redeploy. Local copies are retained. This is configuration fallback, not automatic retry to the application origin after a CDN outage; existing component failure behavior remains in place.

Sources checked for this implementation: [Cloudflare R2 S3 setup](https://developers.cloudflare.com/r2/get-started/s3/), [R2 upload limits](https://developers.cloudflare.com/r2/objects/upload-objects/), and [AWS Signature V4 request construction](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html).
