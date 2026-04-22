import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  r2Client,
  r2Config,
  MAX_FILE_SIZE,
  ALLOWED_EXT,
  ALLOWED_CONTENT_TYPE,
  timestampPrefix,
  shortId,
} from './_r2.js';

interface UploadBody {
  size: number;
  contentType: string;
  ext: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }
  const body = req.body as UploadBody;
  const { size, contentType, ext } = body ?? {};
  if (typeof size !== 'number' || size <= 0 || size > MAX_FILE_SIZE) {
    res.status(400).send(`size out of range (max ${MAX_FILE_SIZE} bytes)`);
    return;
  }
  if (typeof contentType !== 'string' || !ALLOWED_CONTENT_TYPE.test(contentType)) {
    res.status(400).send('content type not allowed');
    return;
  }
  if (typeof ext !== 'string' || !ALLOWED_EXT.has(ext.toLowerCase())) {
    res.status(400).send('extension not allowed');
    return;
  }

  const client = r2Client();
  const { bucket, storageCapGB } = r2Config();
  const capBytes = storageCapGB * 1024 * 1024 * 1024;
  await evictUntilFits(client, bucket, size, capBytes);

  const id = shortId();
  const key = `videos/${timestampPrefix()}-${id}.${ext.toLowerCase()}`;

  const putUrl = await getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    { expiresIn: 3600 },
  );

  res.status(200).json({
    shortid: id,
    key,
    putUrl,
    shareUrl: `/v/${id}`,
  });
}

async function evictUntilFits(
  client: ReturnType<typeof r2Client>,
  bucket: string,
  incoming: number,
  cap: number,
): Promise<void> {
  let listed = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: 'videos/' }));
  let objects = [...(listed.Contents ?? [])];
  while (listed.IsTruncated && listed.NextContinuationToken) {
    listed = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: 'videos/',
      ContinuationToken: listed.NextContinuationToken,
    }));
    objects = objects.concat(listed.Contents ?? []);
  }
  objects.sort((a, b) => (a.Key ?? '').localeCompare(b.Key ?? ''));
  let total = objects.reduce((sum, o) => sum + (o.Size ?? 0), 0);
  let i = 0;
  while (total + incoming > cap && i < objects.length) {
    const victim = objects[i++];
    if (!victim.Key) continue;
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: victim.Key }));
    total -= victim.Size ?? 0;
  }
}
