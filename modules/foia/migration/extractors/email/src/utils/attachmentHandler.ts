/**
 * Email Import Engine - Attachment Handler
 */

import { EmailAttachment } from '../types';

/**
 * Upload email attachment to S3 (mock implementation)
 * In production, this would use AWS SDK
 */
export async function uploadAttachmentToS3(
  attachment: EmailAttachment,
  tenantId: string,
  requestId: string
): Promise<string> {
  // Mock implementation - in production, use AWS SDK:
  // const buffer = Buffer.from(attachment.content_base64, 'base64');
  // const s3 = new S3Client({ region: process.env.AWS_REGION });
  // const key = `${tenantId}/requests/${requestId}/attachments/${attachment.filename}`;
  // const command = new PutObjectCommand({
  //   Bucket: process.env.S3_BUCKET,
  //   Key: key,
  //   Body: buffer,
  //   ContentType: attachment.content_type
  // });
  // await s3.send(command);
  // return `https://s3.amazonaws.com/${process.env.S3_BUCKET}/${key}`;

  const filename = attachment.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `https://s3.mock.com/${tenantId}/requests/${requestId}/attachments/${filename}`;
}

/**
 * Validate attachment size and type
 */
export function validateAttachment(attachment: EmailAttachment): {
  valid: boolean;
  error?: string;
} {
  // Decode base64 to get actual size
  const buffer = Buffer.from(attachment.content_base64, 'base64');
  const sizeInMB = buffer.length / (1024 * 1024);

  // Max 25MB per attachment
  if (sizeInMB > 25) {
    return {
      valid: false,
      error: `Attachment "${attachment.filename}" exceeds 25MB limit (${sizeInMB.toFixed(2)}MB)`
    };
  }

  // Check for dangerous file types
  const dangerousExtensions = ['.exe', '.bat', '.cmd', '.com', '.scr', '.vbs', '.js'];
  const ext = attachment.filename.toLowerCase().substring(attachment.filename.lastIndexOf('.'));

  if (dangerousExtensions.includes(ext)) {
    return {
      valid: false,
      error: `Attachment "${attachment.filename}" has a prohibited file type (${ext})`
    };
  }

  return { valid: true };
}

/**
 * Get file size in bytes from base64 string
 */
export function getFileSizeFromBase64(base64Content: string): number {
  const buffer = Buffer.from(base64Content, 'base64');
  return buffer.length;
}
