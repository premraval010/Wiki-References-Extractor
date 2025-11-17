import { NextRequest, NextResponse } from 'next/server';
import { createZip } from '@/lib/zip';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { files } = body;

    if (!files || !Array.isArray(files)) {
      return NextResponse.json(
        { error: 'Files array is required' },
        { status: 400 }
      );
    }

    const fileBuffers = files.map((f: { filename: string; content: number[] }) => ({
      filename: f.filename,
      content: Buffer.from(f.content),
    }));

    const zipBuffer = await createZip(fileBuffers);
    const zipBase64 = zipBuffer.toString('base64');

    return NextResponse.json({ zipBase64 });
  } catch (error) {
    console.error('Error creating ZIP:', error);
    return NextResponse.json(
      { error: `Failed to create ZIP: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}

