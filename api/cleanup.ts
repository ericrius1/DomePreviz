import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, r2Config, TTL_MS, parseKeyTimestamp } from './_r2.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = req.headers.authorization;
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    res.status(401).send('unauthorized');
    return;
  }

  const client = r2Client();
  const { bucket } = r2Config();
  const cutoff = Date.now() - TTL_MS;

  let deleted = 0;
  let token: string | undefined;
  do {
    const listed = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: 'videos/',
      ContinuationToken: token,
    }));
    for (const o of listed.Contents ?? []) {
      if (!o.Key) continue;
      const ts = parseKeyTimestamp(o.Key);
      if (ts !== null && ts < cutoff) {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: o.Key }));
        deleted++;
      }
    }
    token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (token);

  res.status(200).json({ deleted });
}
