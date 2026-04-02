import { prisma } from '@/lib/db';
import { s3Client, BUCKET_NAME } from '@/lib/s3';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { NextRequest, NextResponse } from 'next/server';

// Map file extensions to MIME types
function getMimeType(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'webm': 'audio/webm',
    'ogg': 'audio/ogg',
    'm4a': 'audio/mp4',
    'aac': 'audio/aac',
    'flac': 'audio/flac',
  };
  return mimeTypes[ext || ''] || 'audio/mpeg';
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Range',
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params;

  try {
    const audioFile = await prisma.audioFile.findUnique({
      where: { id: fileId },
    });

    if (!audioFile) {
      return new NextResponse('File not found', { status: 404 });
    }

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: audioFile.storageKey,
    });

    const response = await s3Client.send(command);
    
    if (!response.Body) {
      return new NextResponse('File content empty', { status: 404 });
    }

    // Read the body into a buffer
    const byteArray = await response.Body.transformToByteArray();
    const buffer = Buffer.from(byteArray);

    // Determine correct MIME type from file extension
    const contentType = response.ContentType || getMimeType(audioFile.storageKey);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': buffer.length.toString(),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Range',
      },
    });

  } catch (error) {
    console.error('Error serving audio:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
