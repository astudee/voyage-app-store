import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// R2 is S3-compatible, so we use the AWS SDK
const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.CLOUDFLARE_BUCKET_NAME || "voyage-documents";

export interface R2File {
  key: string;
  size: number;
  lastModified: Date;
  etag?: string;
}

/**
 * Upload a file to R2
 * @param key - The file path/key in R2 (e.g., "to-file/uuid.pdf")
 * @param body - The file content as Buffer or Uint8Array
 * @param contentType - MIME type of the file
 * @returns The key of the uploaded file
 */
export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string = "application/octet-stream"
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  await r2Client.send(command);
  return key;
}

/**
 * Download a file from R2
 * @param key - The file path/key in R2
 * @returns The file content as Buffer
 */
export async function downloadFromR2(key: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  const response = await r2Client.send(command);

  if (!response.Body) {
    throw new Error(`File not found: ${key}`);
  }

  // Convert stream to buffer
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * List files in a prefix (folder)
 * @param prefix - The folder prefix (e.g., "to-file/")
 * @param maxKeys - Maximum number of files to return (default 1000)
 * @returns Array of file objects
 */
export async function listFilesInR2(
  prefix: string,
  maxKeys: number = 1000
): Promise<R2File[]> {
  const command = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: prefix,
    MaxKeys: maxKeys,
  });

  const response = await r2Client.send(command);

  if (!response.Contents) {
    return [];
  }

  return response.Contents.map((item) => ({
    key: item.Key!,
    size: item.Size || 0,
    lastModified: item.LastModified || new Date(),
    etag: item.ETag,
  }));
}

/**
 * Delete a file from R2
 * @param key - The file path/key in R2
 */
export async function deleteFromR2(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  await r2Client.send(command);
}

/**
 * Generate a signed URL for viewing/downloading a file
 * @param key - The file path/key in R2
 * @param expiresIn - URL expiration time in seconds (default 1 hour)
 * @returns Signed URL string
 */
export async function getSignedViewUrl(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  return await getSignedUrl(r2Client, command, { expiresIn });
}

/**
 * Generate a signed URL for uploading a file
 * @param key - The file path/key in R2
 * @param contentType - MIME type of the file
 * @param expiresIn - URL expiration time in seconds (default 1 hour)
 * @returns Signed URL string
 */
export async function getSignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = 3600
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  return await getSignedUrl(r2Client, command, { expiresIn });
}

/**
 * Check if a file exists in R2
 * @param key - The file path/key in R2
 * @returns true if file exists, false otherwise
 */
export async function fileExistsInR2(key: string): Promise<boolean> {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    await r2Client.send(command);
    return true;
  } catch {
    return false;
  }
}
