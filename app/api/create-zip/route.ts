import { NextRequest, NextResponse } from 'next/server';
import { createZip } from '@/lib/zip';
import { isPdfUrl, downloadPdf, renderUrlToPdf, sanitizeFilename } from '@/lib/pdf';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { references } = body; // Changed: receive references instead of files

    if (!references || !Array.isArray(references)) {
      return NextResponse.json(
        { error: 'References array is required' },
        { status: 400 }
      );
    }

    // Validate file count
    if (references.length === 0) {
      return NextResponse.json(
        { error: 'No references provided' },
        { status: 400 }
      );
    }

    if (references.length > 250) {
      return NextResponse.json(
        { error: 'Maximum 250 files allowed per ZIP' },
        { status: 400 }
      );
    }

    console.log(`Creating ZIP with ${references.length} references...`);

    // Process references server-side to avoid 413 payload limit
    const fileBuffers: { filename: string; content: Buffer }[] = [];
    
    for (let i = 0; i < references.length; i++) {
      const ref = references[i];
      if (!ref.id || !ref.sourceUrl || !ref.title) {
        console.warn(`Skipping invalid reference at index ${i}`);
        continue;
      }

      try {
        let pdfBuffer: Buffer;
        let pdfFilename: string;

        // Determine if it's a direct PDF or needs rendering
        if (isPdfUrl(ref.sourceUrl)) {
          // Direct PDF download
          pdfBuffer = await downloadPdf(ref.sourceUrl);
          const urlPath = new URL(ref.sourceUrl).pathname;
          const urlFilename = urlPath.split('/').pop() || '';
          pdfFilename = urlFilename.endsWith('.pdf')
            ? `${ref.id} - ${urlFilename}`
            : `${ref.id} - ${sanitizeFilename(ref.title, ref.id)}.pdf`;
        } else {
          // Render HTML to PDF using Puppeteer
          pdfBuffer = await renderUrlToPdf(ref.sourceUrl);
          pdfFilename = `${ref.id} - ${sanitizeFilename(ref.title, ref.id)}.pdf`;
        }

        fileBuffers.push({
          filename: pdfFilename,
          content: pdfBuffer,
        });

        console.log(`Processed reference ${ref.id}/${references.length}`);
      } catch (err) {
        console.error(`Error processing reference ${ref.id}:`, err);
        // Continue with other files - don't fail the whole ZIP
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

