'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { buildWikipediaUrl } from '@/lib/wiki';
import Home from '@/app/page';

export default function WikiSlugPage() {
  const params = useParams();
  const router = useRouter();
  const [wikiUrl, setWikiUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const slug = params.slug as string;
    if (!slug) {
      router.push('/');
      return;
    }

    try {
      // Decode the slug (it might be URL encoded)
      const decodedSlug = decodeURIComponent(slug);
      
      // Try to extract language from slug or default to 'en'
      // Format: lang:slug or just slug
      let lang = 'en';
      let articleSlug = decodedSlug;
      
      if (decodedSlug.includes(':')) {
        const parts = decodedSlug.split(':');
        if (parts.length >= 2 && parts[0].length === 2) {
          // Assume first part is language code
          lang = parts[0];
          articleSlug = parts.slice(1).join(':');
        }
      }

      // Build the Wikipedia URL
      const url = buildWikipediaUrl(articleSlug, lang);
      setWikiUrl(url);
      setIsLoading(false);
    } catch (error) {
      console.error('Error parsing slug:', error);
      router.push('/');
    }
  }, [params.slug, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading article...</p>
        </div>
      </div>
    );
  }

  // Render the main Home component with the pre-filled URL
  return <Home initialUrl={wikiUrl} />;
}

