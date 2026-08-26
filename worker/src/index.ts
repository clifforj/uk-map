import {
  Compression,
  EtagMismatch,
  PMTiles,
  RangeResponse,
  ResolvedValueCache,
  Source,
  TileType,
  tileTypeExt,
} from "pmtiles";
import { pmtiles_path, tile_path } from "../shared/index";

interface Env {
  // biome-ignore lint: config name
  ALLOWED_ORIGINS?: string;
  // biome-ignore lint: config name
  BUCKET: R2Bucket;
  // biome-ignore lint: config name
  CACHE_CONTROL?: string;
  // biome-ignore lint: config name
  PMTILES_PATH?: string;
  // biome-ignore lint: config name
  PUBLIC_HOSTNAME?: string;
}

class KeyNotFoundError extends Error {}

async function nativeDecompress(
  buf: ArrayBuffer,
  compression: Compression
): Promise<ArrayBuffer> {
  if (compression === Compression.None || compression === Compression.Unknown) {
    return buf;
  }
  if (compression === Compression.Gzip) {
    const stream = new Response(buf).body;
    const result = stream?.pipeThrough(new DecompressionStream("gzip"));
    return new Response(result).arrayBuffer();
  }
  throw new Error("Compression method not supported");
}

const CACHE = new ResolvedValueCache(25, undefined, nativeDecompress);

// Plain R2 objects that aren't PMTiles archives, so they never match
// tile_path()'s tile/tileset regexes. Served by passthrough, below, rather
// than through the PMTiles reader. See issue 4.4 (fonts/sprites) and issue
// 5.2 (latest.json, needed by the demo client to resolve the live version).
const STATIC_PATH_PREFIXES = ["fonts/", "sprites/"];
const STATIC_EXACT_PATHS = new Set(["latest.json"]);

const isStaticPassthroughKey = (key: string): boolean =>
  STATIC_EXACT_PATHS.has(key) || STATIC_PATH_PREFIXES.some((p) => key.startsWith(p));

const STATIC_EXT_CONTENT_TYPE: Record<string, string> = {
  pbf: "application/x-protobuf",
  png: "image/png",
  json: "application/json",
};

// Cloudflare's edge cache (caches.default) is keyed by URL and lives outside
// any one Worker deploy — it isn't invalidated by `wrangler deploy` or by an
// R2 object changing underneath it. Before this passthrough branch existed,
// static-path requests (e.g. latest.json before it had ever been promoted)
// fell through to the tile/tileset PMTiles-reader path, which cached its
// 404 for a day under the plain request URL. Using a namespaced cache key
// here, instead of the raw request URL, keeps this branch from ever reading
// a response an earlier code path cached under that same URL.
const staticCacheKey = (requestUrl: string): string =>
  `${requestUrl}${requestUrl.includes("?") ? "&" : "?"}__static_passthrough=1`;

async function handleStaticPassthrough(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  cache: Cache,
  key: string,
  allowedOrigin: string
): Promise<Response> {
  if (request.method.toUpperCase() === "OPTIONS") {
    const headers = new Headers({ Vary: "Origin" });
    if (allowedOrigin) {
      headers.set("Access-Control-Allow-Origin", allowedOrigin);
      headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      headers.set("Access-Control-Max-Age", "86400");
    }
    return new Response(undefined, { status: 204, headers });
  }

  const cacheKey = staticCacheKey(request.url);

  const cached = await cache.match(cacheKey);
  if (cached) {
    const respHeaders = new Headers(cached.headers);
    if (allowedOrigin) respHeaders.set("Access-Control-Allow-Origin", allowedOrigin);
    respHeaders.set("Vary", "Origin");
    return new Response(cached.body, { headers: respHeaders, status: cached.status });
  }

  const obj = await env.BUCKET.get(key);
  if (!obj) {
    return new Response(undefined, { status: 404, headers: new Headers({ Vary: "Origin" }) });
  }

  const data = await obj.arrayBuffer();
  const ext = key.split(".").pop() || "";
  const cacheableHeaders = new Headers();
  cacheableHeaders.set("Content-Type", STATIC_EXT_CONTENT_TYPE[ext] || "application/octet-stream");
  cacheableHeaders.set(
    "Cache-Control",
    obj.httpMetadata?.cacheControl || env.CACHE_CONTROL || "public, max-age=86400"
  );

  const cacheable = new Response(data, { headers: cacheableHeaders, status: 200 });
  ctx.waitUntil(cache.put(cacheKey, cacheable));

  const respHeaders = new Headers(cacheableHeaders);
  if (allowedOrigin) respHeaders.set("Access-Control-Allow-Origin", allowedOrigin);
  respHeaders.set("Vary", "Origin");
  return new Response(data, { headers: respHeaders, status: 200 });
}

class R2Source implements Source {
  env: Env;
  archiveName: string;

  constructor(env: Env, archiveName: string) {
    this.env = env;
    this.archiveName = archiveName;
  }

  getKey() {
    return this.archiveName;
  }

  async getBytes(
    offset: number,
    length: number,
    signal?: AbortSignal,
    etag?: string
  ): Promise<RangeResponse> {
    const resp = await this.env.BUCKET.get(
      pmtiles_path(this.archiveName, this.env.PMTILES_PATH),
      {
        range: { offset: offset, length: length },
        onlyIf: { etagMatches: etag },
      }
    );
    if (!resp) {
      throw new KeyNotFoundError("Archive not found");
    }

    const o = resp as R2ObjectBody;

    if (!o.body) {
      throw new EtagMismatch();
    }

    const a = await o.arrayBuffer();
    return {
      data: a,
      etag: o.etag,
      cacheControl: o.httpMetadata?.cacheControl,
      expires: o.httpMetadata?.cacheExpiry?.toISOString(),
    };
  }
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    if (request.method.toUpperCase() === "POST")
      return new Response(undefined, { status: 405 });

    const url = new URL(request.url);
    const cache = caches.default;

    let allowedOrigin = "";
    const requestOrigin = request.headers.get("Origin");
    // Any http://localhost:PORT origin is allowed for local development,
    // regardless of what's in ALLOWED_ORIGINS — see issue 4.1.
    if (requestOrigin && /^http:\/\/localhost:\d+$/.test(requestOrigin)) {
      allowedOrigin = requestOrigin;
    }
    if (typeof env.ALLOWED_ORIGINS !== "undefined") {
      for (const o of env.ALLOWED_ORIGINS.split(",")) {
        if (o === requestOrigin || o === "*") {
          allowedOrigin = o;
        }
      }
    }

    const key = url.pathname.replace(/^\//, "");
    if (isStaticPassthroughKey(key)) {
      return handleStaticPassthrough(request, env, ctx, cache, key, allowedOrigin);
    }

    const { ok, name, tile, ext } = tile_path(url.pathname);

    if (!ok) {
      return new Response("Invalid URL", { status: 404 });
    }

    const cached = await cache.match(request.url);
    if (cached) {
      const respHeaders = new Headers(cached.headers);
      if (allowedOrigin)
        respHeaders.set("Access-Control-Allow-Origin", allowedOrigin);
      respHeaders.set("Vary", "Origin");

      return new Response(cached.body, {
        headers: respHeaders,
        status: cached.status,
      });
    }

    const cacheableResponse = (
      body: ArrayBuffer | string | undefined,
      cacheableHeaders: Headers,
      status: number
    ) => {
      cacheableHeaders.set(
        "Cache-Control",
        env.CACHE_CONTROL || "public, max-age=86400"
      );

      const cacheable = new Response(body, {
        headers: cacheableHeaders,
        status: status,
      });

      ctx.waitUntil(cache.put(request.url, cacheable));

      const respHeaders = new Headers(cacheableHeaders);
      if (allowedOrigin)
        respHeaders.set("Access-Control-Allow-Origin", allowedOrigin);
      respHeaders.set("Vary", "Origin");
      return new Response(body, { headers: respHeaders, status: status });
    };

    const cacheableHeaders = new Headers();
    const source = new R2Source(env, name);
    const p = new PMTiles(source, CACHE, nativeDecompress);
    try {
      const pHeader = await p.getHeader();

      if (!tile) {
        cacheableHeaders.set("Content-Type", "application/json");
        const t = await p.getTileJson(
          `https://${env.PUBLIC_HOSTNAME || url.hostname}/${name}`
        );
        return cacheableResponse(JSON.stringify(t), cacheableHeaders, 200);
      }

      if (tile[0] < pHeader.minZoom || tile[0] > pHeader.maxZoom) {
        return cacheableResponse(undefined, cacheableHeaders, 404);
      }

      const extToType: Record<string, TileType> = {
        mvt: TileType.Mvt,
        pbf: TileType.Mvt, // allow this for now. Eventually we will delete this in favor of .mvt
        png: TileType.Png,
        jpg: TileType.Jpeg,
        webp: TileType.Webp,
        avif: TileType.Avif,
      };

      const expectedType = extToType[ext];
      if (
        pHeader.tileType !== expectedType &&
        tileTypeExt(pHeader.tileType) !== ""
      ) {
        return cacheableResponse(
          `Bad request: requested .${ext} but archive has type ${tileTypeExt(
            pHeader.tileType
          )}`,
          cacheableHeaders,
          400
        );
      }

      const tiledata = await p.getZxy(tile[0], tile[1], tile[2]);

      switch (pHeader.tileType) {
        case TileType.Mvt:
          cacheableHeaders.set("Content-Type", "application/x-protobuf");
          break;
        case TileType.Png:
          cacheableHeaders.set("Content-Type", "image/png");
          break;
        case TileType.Jpeg:
          cacheableHeaders.set("Content-Type", "image/jpeg");
          break;
        case TileType.Webp:
          cacheableHeaders.set("Content-Type", "image/webp");
          break;
      }

      if (tiledata) {
        return cacheableResponse(tiledata.data, cacheableHeaders, 200);
      }
      return cacheableResponse(undefined, cacheableHeaders, 204);
    } catch (e) {
      if (e instanceof KeyNotFoundError) {
        return cacheableResponse("Archive not found", cacheableHeaders, 404);
      }
      throw e;
    }
  },
};
