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
 * Extracts the slug and language from a Wikipedia URL
 * Returns { slug, lang } or null if invalid
 */
export function extractWikipediaSlug(url: string): { slug: string; lang: string } | null {
  try {
    const urlObj = new URL(url);
    const match = urlObj.pathname.match(/^\/wiki\/(.+)$/);
    if (!match) return null;
    
    const lang = urlObj.hostname.split('.')[0] || 'en';
    const slug = decodeURIComponent(match[1]);
    
    return { slug, lang };
  } catch {
    return null;
  }
}

/**
 * Reconstructs a Wikipedia URL from slug and language
 */
export function buildWikipediaUrl(slug: string, lang: string = 'en'): string {
  const encodedSlug = encodeURIComponent(slug);
  return `https://${lang}.wikipedia.org/wiki/${encodedSlug}`;
}

/**
 * Extracts the article title from Wikipedia HTML
 */
export function extractArticleTitle(html: string): string {
  const $ = cheerio.load(html);
  // Try to get title from h1.firstHeading or title tag
  const title = $('h1.firstHeading').text().trim() || 
                $('title').text().replace(' - Wikipedia', '').trim() ||
                'Wikipedia Article';
  return title;
}

/**
 * Article metadata extracted from Wikipedia
 */
export type ArticleMetadata = {
  title: string;
  summary: string;
  firstPublished?: string;
  lastModified?: string;
  editCount?: number;
  pageViews?: number;
  wordCount?: number;
  categories?: string[];
  languages?: number;
  images?: number;
  articleLength?: 'short' | 'medium' | 'long' | 'very long';
  coordinates?: string;
  infoboxData?: Record<string, string>;
};

/**
 * Extracts article metadata from Wikipedia HTML
 */
export function extractArticleMetadata(html: string, url: string): ArticleMetadata {
  const $ = cheerio.load(html);
  
  // Extract title
  const title = extractArticleTitle(html);
  
  // Extract summary (first paragraph or first few sentences)
  let summary = '';
  
  // Try multiple selectors to find the first meaningful paragraph
  const selectors = [
    'div.mw-parser-output > p',
    'div.mw-parser-output p',
    'p',
    '.mw-parser-output > p:first-of-type',
  ];
  
  for (const selector of selectors) {
    const $paras = $(selector);
    if ($paras.length > 0) {
      // Try first paragraph
      let paraText = $paras.first().text().trim();
      if (paraText.length > 20) {
        summary = paraText;
        break;
      }
      
      // If first is too short, try combining first 2-3 paragraphs
      if (paraText.length < 20 && $paras.length > 1) {
        const combined = $paras.slice(0, 3).map((_, el) => $(el).text().trim()).get().join(' ');
        if (combined.length > 20) {
          summary = combined;
          break;
        }
      }
    }
  }
  
  // Clean up summary
  if (summary) {
    // Remove citation markers like [1], [2], etc.
    summary = summary.replace(/\[\d+\]/g, '').trim();
    // Remove extra whitespace
    summary = summary.replace(/\s+/g, ' ').trim();
    
    // Try to get first 2-3 sentences (more interesting than just first sentence)
    const sentences = summary.match(/[^.!?]+[.!?]+/g);
    if (sentences && sentences.length > 0) {
      // Take first 2-3 sentences, but limit to ~250 chars
      let combined = '';
      for (let i = 0; i < Math.min(3, sentences.length); i++) {
        if ((combined + sentences[i]).length <= 250) {
          combined += sentences[i];
        } else {
          break;
        }
      }
      if (combined.length > 20) {
        summary = combined.trim();
      } else {
        // Fallback: just truncate to 200 chars
        summary = summary.substring(0, 200).trim();
        if (summary.length === 200) summary += '...';
      }
    } else {
      // No sentence endings found, just truncate intelligently
      if (summary.length > 200) {
        // Try to cut at word boundary
        const truncated = summary.substring(0, 200);
        const lastSpace = truncated.lastIndexOf(' ');
        summary = lastSpace > 150 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
      }
    }
  }
  
  // Final fallback: if still no summary, try getting any text from the article
  if (!summary || summary.length < 20) {
    const $anyText = $('div.mw-parser-output').first();
    if ($anyText.length > 0) {
      const text = $anyText.text().trim();
      if (text.length > 20) {
        summary = text.substring(0, 200).trim();
        const lastSpace = summary.lastIndexOf(' ');
        if (lastSpace > 150) {
          summary = summary.substring(0, lastSpace) + '...';
        } else {
          summary += '...';
        }
      }
    }
  }
  
  // Extract last modified date from history link or metadata
  let lastModified: string | undefined;
  const $lastModified = $('li#footer-info-lastmod, .mw-history-histlinks a').first();
  if ($lastModified.length > 0) {
    const modifiedText = $lastModified.text().trim();
    // Try to extract date from text like "Last edited on 15 January 2024"
    const dateMatch = modifiedText.match(/(\d{1,2}\s+\w+\s+\d{4})/);
    if (dateMatch) {
      lastModified = dateMatch[1];
    }
  }
  
  // Extract edit count (approximate from revision history)
  let editCount: number | undefined;
  const $editCount = $('a[href*="action=history"]').first();
  if ($editCount.length > 0) {
    const editText = $editCount.text();
    const countMatch = editText.match(/(\d+[\d,]*)\s*(?:edit|revision)/i);
    if (countMatch) {
      editCount = parseInt(countMatch[1].replace(/,/g, ''), 10);
    }
  }
  
  // Extract word count (approximate from article text)
  let wordCount: number | undefined;
  const articleText = $('div.mw-parser-output').text();
  if (articleText) {
    const words = articleText.split(/\s+/).filter(w => w.length > 0);
    wordCount = words.length;
  }
  
  // Extract categories
  const categories: string[] = [];
  $('div#catlinks a[href*="/wiki/Category:"]').each((_, el) => {
    const category = $(el).text().trim();
    if (category && !category.includes('Hidden categories')) {
      categories.push(category);
    }
  });
  
  // Count available languages (from interlanguage links)
  const languages = $('div#p-lang li').length;
  
  // Count images in the article
  const images = $('div.mw-parser-output img:not(.mw-logo-fallback)').length;
  
  // Determine article length category
  let articleLength: 'short' | 'medium' | 'long' | 'very long' | undefined;
  if (wordCount) {
    if (wordCount < 1000) articleLength = 'short';
    else if (wordCount < 5000) articleLength = 'medium';
    else if (wordCount < 15000) articleLength = 'long';
    else articleLength = 'very long';
  }
  
  // Extract coordinates if available (for location articles)
  let coordinates: string | undefined;
  const $coordinates = $('span.geo, .geo-dec, .coordinates');
  if ($coordinates.length > 0) {
    const coordText = $coordinates.first().text().trim();
    if (coordText) {
      coordinates = coordText;
    }
  }
  
  // Extract some infobox data (common fields)
  const infoboxData: Record<string, string> = {};
  const $infobox = $('table.infobox, .infobox');
  if ($infobox.length > 0) {
    $infobox.find('tr').each((_, row) => {
      const $row = $(row);
      const $th = $row.find('th');
      const $td = $row.find('td');
      if ($th.length > 0 && $td.length > 0) {
        const key = $th.text().trim().replace(/:/g, '');
        const value = $td.text().trim();
        if (key && value && key.length < 50 && value.length < 100) {
          // Only store a few interesting fields
          const interestingKeys = ['location', 'established', 'founded', 'opened', 'type', 'status', 'country', 'region'];
          if (interestingKeys.some(k => key.toLowerCase().includes(k))) {
            infoboxData[key] = value;
          }
        }
      }
    });
  }
  
  return {
    title,
    summary: summary || 'No summary available',
    lastModified,
    editCount,
    wordCount,
    categories: categories.slice(0, 5), // Limit to 5 categories
    languages: languages > 0 ? languages : undefined,
    images: images > 0 ? images : undefined,
    articleLength,
    coordinates,
    infoboxData: Object.keys(infoboxData).length > 0 ? infoboxData : undefined,
  };
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

