import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import {
  validateWikipediaUrl,
  fetchArticleHtml,
  extractReferences,
} from '@/lib/wiki';
import type { ExtractReferencesResponse } from '@/app/api/process-article/route';

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

    const response: ExtractReferencesResponse = {
      articleTitle,
      references,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error extracting references:', error);
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}

