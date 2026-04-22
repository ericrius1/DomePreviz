import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { r2Client, r2Config, extKind } from './_r2.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).send('Method Not Allowed');
    return;
  }
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!/^[a-zA-Z0-9_-]{4,16}$/.test(id)) {
    res.status(400).send('bad id');
    return;
  }

  const client = r2Client();
  const { bucket, publicBase } = r2Config();

  let listed = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: 'videos/' }));
  let match = listed.Contents?.find((o) => o.Key && keyMatchesId(o.Key, id));
  while (!match && listed.IsTruncated && listed.NextContinuationToken) {
    listed = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: 'videos/',
      ContinuationToken: listed.NextContinuationToken,
    }));
    match = listed.Contents?.find((o) => o.Key && keyMatchesId(o.Key, id));
  }

  if (!match?.Key) {
    res.status(404).send('not found');
    return;
  }

  const ext = match.Key.split('.').pop()?.toLowerCase() ?? '';
  const kind = extKind(ext);
  if (!kind) {
    res.status(404).send('not found');
    return;
  }

  res.setHeader('Cache-Control', 'public, max-age=60');
  res.status(200).json({
    url: `${publicBase}/${match.Key}`,
    kind,
  });
}

function keyMatchesId(key: string, id: string): boolean {
  return new RegExp(`-${id}\\.[a-z0-9]+$`).test(key);
}
