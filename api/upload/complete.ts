import type { VercelRequest, VercelResponse } from '@vercel/node';
import { CompleteMultipartUploadCommand, AbortMultipartUploadCommand } from '@aws-sdk/client-s3';
import { r2Client, r2Config } from '../_r2';

interface CompleteBody {
  key: string;
  uploadId: string;
  parts: { PartNumber: number; ETag: string }[];
}

interface AbortBody {
  key: string;
  uploadId: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const client = r2Client();
  const { bucket } = r2Config();

  if (req.method === 'DELETE') {
    const body = req.body as AbortBody;
    if (!body?.key || !body?.uploadId) {
      res.status(400).send('key and uploadId required');
      return;
    }
    await client.send(new AbortMultipartUploadCommand({
      Bucket: bucket,
      Key: body.key,
      UploadId: body.uploadId,
    }));
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const body = req.body as CompleteBody;
  if (!body?.key || !body?.uploadId || !Array.isArray(body.parts) || body.parts.length === 0) {
    res.status(400).send('key, uploadId, parts required');
    return;
  }

  const parts = [...body.parts].sort((a, b) => a.PartNumber - b.PartNumber);

  try {
    await client.send(new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: body.key,
      UploadId: body.uploadId,
      MultipartUpload: { Parts: parts },
    }));
  } catch (err) {
    await client.send(new AbortMultipartUploadCommand({
      Bucket: bucket,
      Key: body.key,
      UploadId: body.uploadId,
    })).catch(() => { /* best effort */ });
    const msg = err instanceof Error ? err.message : 'complete failed';
    res.status(500).send(msg);
    return;
  }

  const shortid = body.key.match(/-([a-zA-Z0-9]+)\.[a-z0-9]+$/)?.[1];
  if (!shortid) {
    res.status(500).send('Could not extract shortid from key');
    return;
  }
  res.status(200).json({ shareUrl: `/v/${shortid}` });
}
