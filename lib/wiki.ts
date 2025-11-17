import * as cheerio from 'cheerio';

export type Reference = {
  id: number;
  title: string;
  sourceUrl: string;
};

/**
 * Validates if a URL is a valid Wikipedia URL
 */
export function validateWikipediaUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    // Match pattern: https://<lang>.wikipedia.org/wiki/...
    const wikipediaPattern = /^https:\/\/([a-z]+)\.wikipedia\.org\/wiki\//;
    return wikipediaPattern.test(urlObj.href);
  } catch {
    return false;
  }
}

/**
 * Fetches the HTML content of a Wikipedia article
 */
export async function fetchArticleHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch article: ${response.status} ${response.statusText}`);
  }

  return await response.text();
}

/**
 * Extracts all external references/citations from Wikipedia article HTML
 */
export function extractReferences(html: string): Reference[] {
  const $ = cheerio.load(html);
  const references: Reference[] = [];
  let id = 1;

  // Target: ol.references li or elements with .reference inside
  $('ol.references li, .reference').each((_, element) => {
    const $li = $(element);
    
    // Find the first external link (ignore internal /wiki/ links)
    const $link = $li.find('a[href^="http"]').first();
    
    if ($link.length === 0) {
      return; // Skip if no external link found
    }

    const sourceUrl = $link.attr('href');
    if (!sourceUrl) {
      return;
    }

    // Skip internal Wikipedia links
    if (sourceUrl.includes('/wiki/') && sourceUrl.includes('wikipedia.org')) {
      return;
    }

    // Extract title from multiple possible sources
    let title = '';
    
    // Try to get title from <cite> text
    const $cite = $li.find('cite');
    if ($cite.length > 0) {
      title = $cite.text().trim();
    }
    
    // If no cite, try anchor text
    if (!title) {
      title = $link.text().trim();
    }
    
    // If still no title, use the whole li text truncated
    if (!title) {
      title = $li.text().trim();
    }
    
    // Clean up title: remove extra whitespace, newlines
    title = title.replace(/\s+/g, ' ').trim();
    
    // Truncate if too long (for display purposes, actual filename will be sanitized later)
    if (title.length > 200) {
      title = title.substring(0, 200) + '...';
    }
    
    // Fallback if still no useful title
    if (!title || title.length === 0) {
      title = `Reference #${id}`;
    }

    references.push({
      id: id++,
      title,
      sourceUrl,
    });
  });

  return references;
}

