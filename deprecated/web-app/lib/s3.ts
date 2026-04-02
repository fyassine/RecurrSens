import { S3Client } from '@aws-sdk/client-s3';

if (!process.env.S3_REGION) throw new Error('S3_REGION is not defined');
if (!process.env.S3_ENDPOINT) throw new Error('S3_ENDPOINT is not defined');
if (!process.env.S3_ACCESS_KEY) throw new Error('S3_ACCESS_KEY is not defined');
if (!process.env.S3_SECRET_KEY) throw new Error('S3_SECRET_KEY is not defined');
if (!process.env.S3_BUCKET) throw new Error('S3_BUCKET is not defined');

export const s3Client = new S3Client({
  region: process.env.S3_REGION,
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: true, // Needed for MinIO
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
});

export const BUCKET_NAME = process.env.S3_BUCKET;
