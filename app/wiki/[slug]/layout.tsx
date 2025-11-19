import { Metadata } from 'next';
import { buildWikipediaUrl, extractArticleTitle, fetchArticleHtml } from '@/lib/wiki';

type Props = {
  params: { slug: string } | Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolvedParams = params instanceof Promise ? await params : params;
  const { slug } = resolvedParams;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://wiki-reference-downloader.vercel.app';
  const ogImageUrl = `${baseUrl}/wiki-reference-downloader.jpg`;

  try {
    // Decode the slug
    const decodedSlug = decodeURIComponent(slug);
    
    // Extract language and article slug
    let lang = 'en';
    let articleSlug = decodedSlug;
    
    if (decodedSlug.includes(':')) {
      const parts = decodedSlug.split(':');
      if (parts.length === 2 && parts[0].length === 2) {
        lang = parts[0];
        articleSlug = parts.slice(1).join(':');
      }
    }

    // Build Wikipedia URL
    const wikiUrl = buildWikipediaUrl(articleSlug, lang);
    
    // Fetch article to get title
    let articleTitle = articleSlug.replace(/_/g, ' ');
    try {
      const html = await fetchArticleHtml(wikiUrl);
      articleTitle = extractArticleTitle(html);
    } catch (error) {
      // If fetch fails, use the slug as title
      console.error('Failed to fetch article for metadata:', error);
    }

    const title = `Download References: ${articleTitle} - Wiki Reference Downloader`;
    const description = `Download all external references and citations from the Wikipedia article "${articleTitle}" as PDFs in a single ZIP file.`;

    return {
      title,
      description,
      openGraph: {
        title: `Download References: ${articleTitle}`,
        description,
        url: `${baseUrl}/wiki/${slug}`,
        siteName: 'Wiki Reference Downloader',
        locale: 'en_US',
        type: 'website',
        images: [
          {
            url: ogImageUrl,
            width: 1536,
            height: 1024,
            type: 'image/png',
            alt: `Wikipedia Reference Downloader - ${articleTitle}`,
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title: `Download References: ${articleTitle}`,
        description,
        images: [ogImageUrl],
      },
      alternates: {
        canonical: `${baseUrl}/wiki/${slug}`,
      },
    };
  } catch (error) {
    // Fallback metadata
    return {
      title: 'Wiki Reference Downloader',
      description: 'Download all Wikipedia article references as PDFs',
    };
  }
}

export default function WikiSlugLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

