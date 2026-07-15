import { mediaCompleteRequest, mediaSignatureResponse } from '@bliver/contracts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseCloudinaryUpload(value: unknown, publicId: string) {
  if (!isRecord(value) || value.public_id !== publicId) {
    throw new Error('Invalid Cloudinary upload response');
  }
  const parsed = mediaCompleteRequest.safeParse({ version: value.version, width: value.width, height: value.height, format: value.format });
  if (!parsed.success) throw new Error('Invalid Cloudinary upload response');
  return parsed.data;
}

export async function uploadMedia(file: File): Promise<{ readonly assetId: string }> {
  const response = await fetch('/api/v1/media/signature', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify({ mimeType: file.type, bytes: file.size }) });
  if (!response.ok) throw new Error('Upload signing failed');
  const signed = mediaSignatureResponse.parse(await response.json());
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', signed.apiKey);
  form.append('timestamp', String(signed.timestamp));
  form.append('signature', signed.signature);
  form.append('public_id', signed.publicId);
  const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(signed.cloudName)}/image/upload`, { method: 'POST', body: form });
  if (!uploadResponse.ok) throw new Error('Cloudinary upload failed');
  const upload = parseCloudinaryUpload(await uploadResponse.json(), signed.publicId);
  const completion = await fetch(`/api/v1/media/${encodeURIComponent(signed.assetId)}/complete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version: upload.version, width: upload.width, height: upload.height, format: upload.format }),
  });
  if (!completion.ok) throw new Error('Upload completion failed');
  return { assetId: signed.assetId };
}
