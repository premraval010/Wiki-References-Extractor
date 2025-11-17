import { NextRequest, NextResponse } from 'next/server';
import { isPdfUrl, downloadPdf, renderUrlToPdf, sanitizeFilename } from '@/lib/pdf';

export type ProcessReferenceResponse = {
  id: number;
  title: string;
  sourceUrl: string;
  status: 'downloaded' | 'failed';
  pdfFilename?: string;
  error?: string;
  pdfBase64?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, title, sourceUrl } = body;

    if (!id || !title || !sourceUrl) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    try {
      let pdfBuffer: Buffer;
      let pdfFilename: string;

      // Determine if it's a direct PDF or needs rendering
      if (isPdfUrl(sourceUrl)) {
        // Direct PDF download
        pdfBuffer = await downloadPdf(sourceUrl);
        const urlPath = new URL(sourceUrl).pathname;
        const urlFilename = urlPath.split('/').pop() || '';
        pdfFilename = urlFilename.endsWith('.pdf')
          ? `${id} - ${urlFilename}`
          : `${id} - ${sanitizeFilename(title, id)}.pdf`;
      } else {
        // Render HTML to PDF using Puppeteer
        pdfBuffer = await renderUrlToPdf(sourceUrl);
        pdfFilename = `${id} - ${sanitizeFilename(title, id)}.pdf`;
      }

      const response: ProcessReferenceResponse = {
        id,
        title,
        sourceUrl,
        status: 'downloaded',
        pdfFilename,
        pdfBase64: pdfBuffer.toString('base64'),
      };

      return NextResponse.json(response);
    } catch (error) {
      const response: ProcessReferenceResponse = {
        id,
        title,
        sourceUrl,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      return NextResponse.json(response);
    }
  } catch (error) {
    console.error('Error processing reference:', error);
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}

