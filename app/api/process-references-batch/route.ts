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

export type ProcessBatchResponse = {
  results: ProcessReferenceResponse[];
  processed: number;
  failed: number;
};

/**
 * Process a single reference with error handling
 */
async function processSingleReference(
  ref: { id: number; title: string; sourceUrl: string }
): Promise<ProcessReferenceResponse> {
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

    return {
      id: ref.id,
      title: ref.title,
      sourceUrl: ref.sourceUrl,
      status: 'downloaded',
      pdfFilename,
      pdfBase64: pdfBuffer.toString('base64'),
    };
  } catch (error) {
    let errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.includes('[CAPTCHA_BLOCKED]')) {
      errorMessage = errorMessage.replace('[CAPTCHA_BLOCKED]', '').trim();
    } else if (errorMessage.includes('ERR_BLOCKED_BY_CLIENT') || errorMessage.includes('err_blocked_by_client')) {
      errorMessage = 'Page resources were blocked (likely ads/trackers). The page may require JavaScript or have strict security policies that prevent automated access.';
    }

    return {
      id: ref.id,
      title: ref.title,
      sourceUrl: ref.sourceUrl,
      status: 'failed',
      error: errorMessage,
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { references, batchSize = 10 } = body;

    if (!references || !Array.isArray(references)) {
      return NextResponse.json(
        { error: 'References array is required' },
        { status: 400 }
      );
    }

    if (references.length === 0) {
      return NextResponse.json(
        { error: 'No references provided' },
        { status: 400 }
      );
    }

    // Limit batch size to prevent overwhelming the server
    const maxBatchSize = Math.min(batchSize, 20); // Max 20 concurrent requests
    const actualBatchSize = Math.min(maxBatchSize, references.length);

    console.log(`Processing batch of ${references.length} references with concurrency ${actualBatchSize}`);

    const results: ProcessReferenceResponse[] = [];
    let processed = 0;
    let failed = 0;

    // Process references in parallel batches
    // This ensures we don't overwhelm the server while still getting good parallelism
    for (let i = 0; i < references.length; i += actualBatchSize) {
      const batch = references.slice(i, i + actualBatchSize);
      
      // Process batch in parallel
      const batchPromises = batch.map(ref => processSingleReference(ref));
      const batchResults = await Promise.all(batchPromises);
      
      // Add results
      results.push(...batchResults);
      
      // Update counters
      const batchProcessed = batchResults.filter(r => r.status === 'downloaded').length;
      const batchFailed = batchResults.filter(r => r.status === 'failed').length;
      processed += batchProcessed;
      failed += batchFailed;
      
      console.log(`Batch ${Math.floor(i / actualBatchSize) + 1} completed: ${batchProcessed} succeeded, ${batchFailed} failed`);
    }

    const response: ProcessBatchResponse = {
      results,
      processed,
      failed,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error processing batch:', error);
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}

