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

    // Validate file count
    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      );
    }

    if (files.length > 250) {
      return NextResponse.json(
        { error: 'Maximum 250 files allowed per ZIP' },
        { status: 400 }
      );
    }

    console.log(`Creating ZIP with ${files.length} files...`);

    // Convert to buffers with better memory handling
    const fileBuffers: { filename: string; content: Buffer }[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (!f.filename || !f.content || !Array.isArray(f.content)) {
        console.warn(`Skipping invalid file at index ${i}`);
        continue;
      }

      try {
        const buffer = Buffer.from(f.content);
        fileBuffers.push({
          filename: f.filename,
          content: buffer,
        });
      } catch (err) {
        console.error(`Error processing file ${i}:`, err);
        // Continue with other files
      }
    }

    if (fileBuffers.length === 0) {
      return NextResponse.json(
        { error: 'No valid files to include in ZIP' },
        { status: 400 }
      );
    }

    console.log(`Processing ${fileBuffers.length} valid files...`);

    // Create ZIP with timeout handling
    const zipBuffer = await Promise.race([
      createZip(fileBuffers),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('ZIP creation timeout')), 240000) // 4 minutes
      )
    ]);

    console.log(`ZIP created successfully, size: ${zipBuffer.length} bytes`);

    // Convert to base64
    const zipBase64 = zipBuffer.toString('base64');

    return NextResponse.json({ zipBase64 });
  } catch (error) {
    console.error('Error creating ZIP:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Provide more specific error messages
    if (errorMessage.includes('timeout')) {
      return NextResponse.json(
        { error: 'ZIP creation timed out. Try with fewer files or contact support.' },
        { status: 504 }
      );
    }
    
    if (errorMessage.includes('size limit') || errorMessage.includes('memory')) {
      return NextResponse.json(
        { error: 'ZIP archive is too large. Maximum size is 500MB.' },
        { status: 413 }
      );
    }

    return NextResponse.json(
      { error: `Failed to create ZIP: ${errorMessage}` },
      { status: 500 }
    );
  }
}

