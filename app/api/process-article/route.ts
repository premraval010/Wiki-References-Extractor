import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import {
  validateWikipediaUrl,
  fetchArticleHtml,
  extractReferences,
} from '@/lib/wiki';
import type { ArticleMetadata, Reference } from '@/lib/wiki';
import { isPdfUrl, downloadPdf, renderUrlToPdf, sanitizeFilename } from '@/lib/pdf';
import { createZip } from '@/lib/zip';

export type ProcessArticleResponse = {
  articleTitle: string;
  totalReferences: number;
  downloadableReferences?: number;
  successCount: number;
  failedCount: number;
  zipBase64?: string;
  references: {
    id: number;
    title: string;
    sourceUrl?: string;
    status: 'downloaded' | 'failed' | 'manual';
    pdfFilename?: string;
    error?: string;
    anchorId?: string;
  }[];
};

export type ExtractReferencesResponse = {
  articleTitle: string;
  references: {
    id: number;
    title: string;
    sourceUrl?: string;
    hasExternalLink: boolean;
    anchorId?: string;
  }[];
  totalReferences: number;
  downloadableReferences: number;
  manualReferences: number;
  metadata?: ArticleMetadata;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { wikiUrl } = body;

    if (!wikiUrl || typeof wikiUrl !== 'string') {
      return NextResponse.json(
        { error: 'Wikipedia URL is required' },
        { status: 400 }
      );
    }

    // Validate Wikipedia URL
    if (!validateWikipediaUrl(wikiUrl)) {
      return NextResponse.json(
        { error: 'Invalid Wikipedia URL. Must be in format: https://<lang>.wikipedia.org/wiki/...' },
        { status: 400 }
      );
    }

    // Fetch article HTML
    let html: string;
    try {
      html = await fetchArticleHtml(wikiUrl);
    } catch (error) {
      return NextResponse.json(
        { error: `Failed to fetch article: ${error instanceof Error ? error.message : 'Unknown error'}` },
        { status: 500 }
      );
    }

    // Extract article title
    const $ = cheerio.load(html);
    const articleTitle = $('h1.firstHeading').text().trim() || 'Unknown Article';

    // Extract references
    const references = extractReferences(html);

    const downloadableRefs = references.filter(
      (ref): ref is Reference & { sourceUrl: string } => Boolean(ref.sourceUrl)
    );

    if (references.length === 0) {
      return NextResponse.json({
        articleTitle,
        totalReferences: 0,
        downloadableReferences: 0,
        successCount: 0,
        failedCount: 0,
        references: [],
      });
    }

    // Process each reference
    const processedReferences: ProcessArticleResponse['references'] = [];
    const files: { filename: string; content: Buffer }[] = [];

    for (const ref of downloadableRefs) {
      try {
        let pdfBuffer: Buffer;
        let pdfFilename: string;

        // Determine if it's a direct PDF or needs rendering
        if (isPdfUrl(ref.sourceUrl)) {
          // Direct PDF download
          pdfBuffer = await downloadPdf(ref.sourceUrl);
          // Extract filename from URL or use sanitized title
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

        files.push({
          filename: pdfFilename,
          content: pdfBuffer,
        });

        processedReferences.push({
          id: ref.id,
          title: ref.title,
          sourceUrl: ref.sourceUrl,
          status: 'downloaded',
          pdfFilename,
          anchorId: ref.anchorId,
        });
      } catch (error) {
        processedReferences.push({
          id: ref.id,
          title: ref.title,
          sourceUrl: ref.sourceUrl,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
          anchorId: ref.anchorId,
        });
      }
    }

    // Create ZIP archive if we have any successful downloads
    let zipBase64: string | undefined;
    if (files.length > 0) {
      try {
        const zipBuffer = await createZip(files);
        zipBase64 = zipBuffer.toString('base64');
      } catch (error) {
        console.error('Failed to create ZIP:', error);
        // Continue without ZIP if creation fails
      }
    }

    const response: ProcessArticleResponse = {
      articleTitle,
      totalReferences: references.length,
      downloadableReferences: downloadableRefs.length,
      successCount: processedReferences.filter((r) => r.status === 'downloaded').length,
      failedCount: processedReferences.filter((r) => r.status === 'failed').length,
      zipBase64,
      references: processedReferences,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error processing article:', error);
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}

