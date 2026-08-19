import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const ACTIONS = new Set(["list", "read", "write", "delete", "stat", "presign", "copy"]);

function passContext(ctx) {
  if (ctx?.context != null && typeof ctx.context === "object" && !Array.isArray(ctx.context)) {
    return { ...ctx.context };
  }
  return {};
}

function mergeData(data) {
  if (data != null && typeof data === "object" && !Array.isArray(data)) {
    return { ...data };
  }
  return {};
}

function resolveAction(ctx) {
  const raw = ctx.config?.action ?? ctx.data?.action ?? "list";
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error("s3: action must be a non-empty string");
  }
  const action = raw.toLowerCase();
  if (!ACTIONS.has(action)) {
    throw new Error(`s3: unsupported action "${raw}"`);
  }
  return action;
}

function resolveBucket(ctx) {
  const bucket = ctx.config?.bucket ?? ctx.data?.bucket;
  if (typeof bucket !== "string" || bucket.length === 0) {
    throw new Error("s3: bucket is required (ctx.config.bucket or ctx.data.bucket)");
  }
  return bucket;
}

function resolveKey(ctx, { required = false } = {}) {
  const key = ctx.config?.key ?? ctx.data?.key;
  if (key == null || key === "") {
    if (required) throw new Error("s3: key is required for this action");
    return undefined;
  }
  if (typeof key !== "string") {
    throw new Error("s3: key must be a string");
  }
  return key;
}

async function resolveSecretValue(secretName, label) {
  if (typeof secretName !== "string" || secretName.length === 0) {
    throw new Error(`s3: ${label} is required`);
  }
  return $secrets.reveal(await $secrets.get(secretName));
}

async function resolveCredentials(ctx) {
  const accessKeyIdSecret = ctx.config?.accessKeyIdSecret;
  const secretAccessKeySecret = ctx.config?.secretAccessKeySecret;

  if (
    typeof accessKeyIdSecret === "string" &&
    accessKeyIdSecret.length > 0 &&
    typeof secretAccessKeySecret === "string" &&
    secretAccessKeySecret.length > 0
  ) {
    return {
      accessKeyId: await resolveSecretValue(accessKeyIdSecret, "accessKeyIdSecret"),
      secretAccessKey: await resolveSecretValue(secretAccessKeySecret, "secretAccessKeySecret"),
    };
  }

  const accessKeyId = ctx.config?.accessKeyId ?? ctx.data?.accessKeyId;
  const secretAccessKey = ctx.config?.secretAccessKey ?? ctx.data?.secretAccessKey;
  if (typeof accessKeyId === "string" && typeof secretAccessKey === "string") {
    return { accessKeyId, secretAccessKey };
  }

  throw new Error(
    "s3: credentials are required (accessKeyIdSecret + secretAccessKeySecret, or accessKeyId + secretAccessKey)",
  );
}

function createS3Client(ctx, credentials) {
  const endpoint = ctx.config?.endpoint ?? ctx.data?.endpoint;
  const region =
    typeof ctx.config?.region === "string" && ctx.config.region.length > 0
      ? ctx.config.region
      : typeof ctx.data?.region === "string" && ctx.data.region.length > 0
        ? ctx.data.region
        : "us-east-1";

  /** @type {import("@aws-sdk/client-s3").S3ClientConfig} */
  const options = {
    region,
    credentials,
  };

  if (typeof endpoint === "string" && endpoint.length > 0) {
    options.endpoint = endpoint;
  }
  if (ctx.config?.forcePathStyle === true || ctx.data?.forcePathStyle === true) {
    options.forcePathStyle = true;
  }

  return new S3Client(options);
}

function toIsoDate(value) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeListedObject(item) {
  return {
    key: item.Key ?? null,
    size: typeof item.Size === "number" ? item.Size : null,
    modified: toIsoDate(item.LastModified),
    etag: item.ETag ?? null,
    storageClass: item.StorageClass ?? null,
  };
}

async function readObjectBody(body) {
  if (body == null) return Buffer.alloc(0);
  if (typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }
  /** @type {Buffer[]} */
  const chunks = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function resolveWriteBody(ctx) {
  if (ctx.config != null && typeof ctx.config === "object" && "body" in ctx.config) {
    return ctx.config.body;
  }
  if (ctx.data?.file != null) {
    const file = ctx.data.file;
    if (Buffer.isBuffer(file) || file instanceof Uint8Array) {
      return Buffer.from(file);
    }
  }
  if (ctx.data?.body != null) {
    const body = ctx.data.body;
    if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
      return Buffer.from(body);
    }
    if (typeof body === "string") {
      return Buffer.from(body, "utf8");
    }
    return Buffer.from(JSON.stringify(body), "utf8");
  }
  throw new Error("s3: write requires ctx.config.body, ctx.data.body, or ctx.data.file");
}

async function s3(ctx) {
  const action = resolveAction(ctx);
  const bucket = resolveBucket(ctx);
  const credentials = await resolveCredentials(ctx);
  const client = createS3Client(ctx, credentials);

  log.info({ action, bucket }, "s3: starting action");

  /** @type {Record<string, unknown>} */
  let result = { action, bucket };

  switch (action) {
    case "list": {
      const prefix = ctx.config?.prefix ?? ctx.data?.prefix ?? "";
      const delimiter = ctx.config?.delimiter ?? ctx.data?.delimiter;
      const maxKeys = Number(ctx.config?.maxKeys ?? ctx.data?.maxKeys ?? 1000);
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: typeof prefix === "string" ? prefix : "",
          Delimiter: typeof delimiter === "string" && delimiter.length > 0 ? delimiter : undefined,
          MaxKeys: Number.isFinite(maxKeys) && maxKeys > 0 ? maxKeys : 1000,
        }),
      );
      const objects = (response.Contents ?? []).map(normalizeListedObject);
      const prefixes = (response.CommonPrefixes ?? [])
        .map((entry) => entry.Prefix)
        .filter((value) => typeof value === "string");
      result = {
        ...result,
        prefix: typeof prefix === "string" ? prefix : "",
        objects,
        prefixes,
        count: objects.length,
        isTruncated: response.IsTruncated === true,
        nextContinuationToken: response.NextContinuationToken ?? null,
      };
      break;
    }
    case "read": {
      const key = resolveKey(ctx, { required: true });
      const outputVar =
        typeof ctx.config?.outputVar === "string" && ctx.config.outputVar.length > 0
          ? ctx.config.outputVar
          : "file";
      const response = await client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );
      const file = await readObjectBody(response.Body);
      const contentType = response.ContentType ?? "application/octet-stream";
      const encoding = ctx.config?.encoding ?? ctx.data?.encoding;
      result = {
        ...result,
        key,
        [outputVar]: file,
        contentType,
        contentLength: file.length,
        etag: response.ETag ?? null,
        lastModified: toIsoDate(response.LastModified),
      };
      if (encoding === "utf8" || encoding === "text") {
        result.text = file.toString("utf8");
      } else if (encoding === "base64") {
        result.base64 = file.toString("base64");
      }
      break;
    }
    case "write": {
      const key = resolveKey(ctx, { required: true });
      const body = resolveWriteBody(ctx);
      const contentType =
        ctx.config?.contentType ??
        ctx.data?.contentType ??
        (typeof ctx.data?.body === "string" ? "text/plain; charset=utf-8" : "application/octet-stream");
      const response = await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: typeof contentType === "string" ? contentType : undefined,
        }),
      );
      result = {
        ...result,
        key,
        etag: response.ETag ?? null,
        contentLength: body.length,
        written: true,
      };
      break;
    }
    case "delete": {
      const key = resolveKey(ctx, { required: true });
      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );
      result = {
        ...result,
        key,
        deleted: true,
      };
      break;
    }
    case "stat": {
      const key = resolveKey(ctx, { required: true });
      const response = await client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );
      result = {
        ...result,
        key,
        contentType: response.ContentType ?? null,
        contentLength: typeof response.ContentLength === "number" ? response.ContentLength : null,
        etag: response.ETag ?? null,
        lastModified: toIsoDate(response.LastModified),
        metadata: response.Metadata ?? {},
      };
      break;
    }
    case "presign": {
      const key = resolveKey(ctx, { required: true });
      const method = String(ctx.config?.presignMethod ?? ctx.data?.presignMethod ?? "get").toLowerCase();
      const expiresIn = Number(ctx.config?.expiresIn ?? ctx.data?.expiresIn ?? 3600);
      const command =
        method === "put"
          ? new PutObjectCommand({ Bucket: bucket, Key: key })
          : new GetObjectCommand({ Bucket: bucket, Key: key });
      const url = await getSignedUrl(client, command, {
        expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600,
      });
      result = {
        ...result,
        key,
        method,
        expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600,
        url,
      };
      break;
    }
    case "copy": {
      const key = resolveKey(ctx, { required: true });
      const sourceKey = ctx.config?.sourceKey ?? ctx.data?.sourceKey;
      const sourceBucket = ctx.config?.sourceBucket ?? ctx.data?.sourceBucket ?? bucket;
      if (typeof sourceKey !== "string" || sourceKey.length === 0) {
        throw new Error("s3: copy requires sourceKey (ctx.config.sourceKey or ctx.data.sourceKey)");
      }
      const response = await client.send(
        new CopyObjectCommand({
          Bucket: bucket,
          Key: key,
          CopySource: `${sourceBucket}/${sourceKey}`,
        }),
      );
      result = {
        ...result,
        key,
        sourceBucket,
        sourceKey,
        etag: response.CopyObjectResult?.ETag ?? null,
        copied: true,
      };
      break;
    }
    default:
      throw new Error(`s3: unsupported action "${action}"`);
  }

  log.info({ action, bucket, key: result.key ?? null }, "s3: action complete");
  return {
    output: { ...mergeData(ctx.data), ...result },
    context: { ...passContext(ctx), ...result },
  };
}

s3.meta = {
  description: "Access S3-compatible object storage (AWS S3, MinIO, Cloudflare R2, etc.)",
  previewConfigKey: "action",
  tags: ["S3", "storage"],
  config: {
    action: {
      type: "string",
      default: "list",
      enum: ["list", "read", "write", "delete", "stat", "presign", "copy"],
      description: "Operation to perform",
    },
    endpoint: {
      type: "string",
      required: false,
      description: "Custom S3 endpoint URL (required for MinIO and most non-AWS providers)",
    },
    region: {
      type: "string",
      default: "us-east-1",
      description: "AWS region (still required by many S3-compatible APIs)",
    },
    bucket: {
      type: "string",
      required: true,
      description: "Bucket name",
    },
    key: {
      type: "string",
      required: false,
      description: "Object key (required for read, write, delete, stat, presign, copy)",
    },
    prefix: {
      type: "string",
      required: false,
      description: "List only keys under this prefix",
    },
    delimiter: {
      type: "string",
      required: false,
      description: "List folder delimiter, usually /",
    },
    maxKeys: {
      type: "number",
      default: 1000,
      description: "Maximum objects returned by list",
    },
    forcePathStyle: {
      type: "boolean",
      default: false,
      description: "Use path-style URLs (often required for MinIO)",
    },
    accessKeyIdSecret: {
      type: "string",
      required: false,
      description: "Named secret for the access key id",
    },
    secretAccessKeySecret: {
      type: "string",
      required: false,
      description: "Named secret for the secret access key",
    },
    accessKeyId: {
      type: "string",
      required: false,
      description: "Plain access key id (prefer secrets in production)",
    },
    secretAccessKey: {
      type: "string",
      required: false,
      description: "Plain secret access key (prefer secrets in production)",
    },
    contentType: {
      type: "string",
      required: false,
      description: "Content-Type for write",
    },
    body: {
      type: "any",
      required: false,
      description: "Body for write when not passed via data",
    },
    outputVar: {
      type: "string",
      default: "file",
      description: "Output key for read action bytes",
    },
    encoding: {
      type: "string",
      required: false,
      enum: ["utf8", "text", "base64"],
      description: "Optional read decoding helper (adds text or base64 field)",
    },
    expiresIn: {
      type: "number",
      default: 3600,
      description: "Presigned URL lifetime in seconds",
    },
    presignMethod: {
      type: "string",
      default: "get",
      enum: ["get", "put"],
      description: "Presign a download (get) or upload (put) URL",
    },
    sourceBucket: {
      type: "string",
      required: false,
      description: "Source bucket for copy (defaults to bucket)",
    },
    sourceKey: {
      type: "string",
      required: false,
      description: "Source key for copy",
    },
  },
  input: {
    action: { type: "string", required: false },
    bucket: { type: "string", required: false },
    key: { type: "string", required: false },
    prefix: { type: "string", required: false },
    body: { type: "any", required: false, description: "Write payload" },
    file: { type: "buffer", required: false, description: "Binary write payload" },
    sourceKey: { type: "string", required: false },
    sourceBucket: { type: "string", required: false },
  },
  output: {
    action: { type: "string" },
    bucket: { type: "string" },
    objects: { type: "array", required: false, description: "list results" },
    file: { type: "buffer", required: false, description: "read bytes (or outputVar)" },
    url: { type: "string", required: false, description: "presigned URL" },
    written: { type: "boolean", required: false },
    deleted: { type: "boolean", required: false },
    copied: { type: "boolean", required: false },
  },
  context: {
    action: { type: "string" },
    bucket: { type: "string" },
  },
  example: {
    data: {},
    config: {
      action: "list",
      endpoint: "https://minio.example.com",
      region: "us-east-1",
      bucket: "backups",
      prefix: "daily/",
      forcePathStyle: true,
      accessKeyIdSecret: "minio_access_key",
      secretAccessKeySecret: "minio_secret_key",
    },
  },
};

export default s3;
