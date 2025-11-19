import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { wikiUrl, articleTitle, referenceCount } = body;

    if (!wikiUrl) {
      return NextResponse.json(
        { error: 'Missing wikiUrl' },
        { status: 400 }
      );
    }

    // Extract article slug from URL for better analytics
    let articleSlug = '';
    try {
      const url = new URL(wikiUrl);
      const pathParts = url.pathname.split('/');
      articleSlug = pathParts[pathParts.length - 1] || '';
    } catch (e) {
      // Invalid URL, use as-is
      articleSlug = wikiUrl;
    }

    // Log search query (visible in Vercel logs)
    // This data can be queried from Vercel logs or enhanced with a database
    const searchData = {
      event: 'wiki_search',
      url: wikiUrl,
      slug: articleSlug,
      title: articleTitle || 'Unknown',
      referenceCount: referenceCount || 0,
      timestamp: new Date().toISOString(),
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
    };

    // Log to console (visible in Vercel function logs)
    console.log('[SEARCH_QUERY]', JSON.stringify(searchData));

    // Return success
    return NextResponse.json({
      success: true,
      message: 'Search logged successfully',
      data: {
        // Return the search data for client-side tracking if needed
        event: 'wiki_search',
        properties: {
          url: wikiUrl,
          slug: articleSlug,
          title: articleTitle || 'Unknown',
          referenceCount: referenceCount || 0,
        },
      },
    });
  } catch (error) {
    console.error('Error logging search:', error);
    // Don't fail the request if logging fails
    return NextResponse.json(
      { error: 'Failed to log search', success: false },
      { status: 500 }
    );
  }
}

