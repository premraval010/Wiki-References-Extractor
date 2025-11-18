'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { ProcessArticleResponse } from '@/app/api/process-article/route';
import type { ExtractReferencesResponse } from '@/app/api/process-article/route';
import type { ProcessReferenceResponse } from '@/app/api/process-reference/route';
import type { ArticleMetadata } from '@/lib/wiki';
import { extractWikipediaSlug } from '@/lib/wiki';

type ReferenceStatus = {
  id: number;
  title: string;
  sourceUrl: string;
  status: 'pending' | 'processing' | 'downloaded' | 'failed';
  pdfFilename?: string;
  error?: string;
};

type HomeProps = {
  initialUrl?: string;
};

export default function Home({ initialUrl }: HomeProps = {}) {
  const router = useRouter();
  const [wikiUrl, setWikiUrl] = useState(initialUrl || '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProcessArticleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareableUrl, setShareableUrl] = useState<string>('');
  
  // Progress tracking
  const [articleTitle, setArticleTitle] = useState<string>('');
  const [articleMetadata, setArticleMetadata] = useState<ArticleMetadata | null>(null);
  const [references, setReferences] = useState<ReferenceStatus[]>([]);
  const [processedCount, setProcessedCount] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<number | null>(null);
  const pdfBuffersRef = useRef<Map<number, Uint8Array>>(new Map());
  const [expandedErrors, setExpandedErrors] = useState<Set<number>>(new Set());


  // Close error popups when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.error-popup-container')) {
        setExpandedErrors(new Set());
      }
    };

    if (expandedErrors.size > 0) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [expandedErrors]);

  // Auto-submit if initialUrl is provided
  useEffect(() => {
    if (initialUrl && !loading && references.length === 0 && !result) {
      const form = document.querySelector('form');
      if (form) {
        form.requestSubmit();
      }
    }
  }, [initialUrl, loading, references.length, result]);

  // Calculate estimated time remaining
  useEffect(() => {
    if (startTime && references.length > 0 && processedCount > 0 && processedCount < references.length) {
      const elapsed = (Date.now() - startTime) / 1000; // seconds
      const avgTimePerRef = elapsed / processedCount;
      const remaining = references.length - processedCount;
      const estimated = Math.ceil(avgTimePerRef * remaining);
      // Only set if it's a valid number (not Infinity or NaN)
      if (isFinite(estimated) && estimated > 0) {
        setEstimatedTimeRemaining(estimated);
      } else {
        setEstimatedTimeRemaining(null);
      }
    } else if (processedCount === 0) {
      // Reset to null when no items processed yet
      setEstimatedTimeRemaining(null);
    }
  }, [processedCount, references.length, startTime]);


  const toggleErrorExpansion = (refId: number) => {
    setExpandedErrors((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(refId)) {
        newSet.delete(refId);
      } else {
        newSet.add(refId);
      }
      return newSet;
    });
  };

  const resetToHome = () => {
    // Reset all state
    setWikiUrl('');
    setLoading(false);
    setResult(null);
    setError(null);
    setArticleTitle('');
    setArticleMetadata(null);
    setReferences([]);
    setProcessedCount(0);
    setStartTime(null);
    setEstimatedTimeRemaining(null);
    pdfBuffersRef.current.clear();
    setExpandedErrors(new Set());
    setShareableUrl('');
    
    // Reset URL to home
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/');
    }
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleShare = async () => {
    if (shareableUrl) {
      try {
        await navigator.clipboard.writeText(shareableUrl);
        // Show temporary success message
        const button = document.querySelector('[data-share-button]') as HTMLElement;
        if (button) {
          const originalText = button.textContent;
          button.textContent = 'Copied!';
          button.classList.add('bg-green-600', 'dark:bg-green-500');
          setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('bg-green-600', 'dark:bg-green-500');
          }, 2000);
        }
      } catch (err) {
        // Fallback: select text in input
        const input = document.createElement('input');
        input.value = shareableUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
    }
  };

  /**
   * Process a single reference (for small batches - faster for < 10 references)
   */
  const processReference = async (ref: { id: number; title: string; sourceUrl: string }) => {
    // Update status to processing
    setReferences((prev) =>
      prev.map((r) => (r.id === ref.id ? { ...r, status: 'processing' as const } : r))
    );

    try {
      // Use shorter timeout for single requests (2 minutes)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minutes

      let response: Response;
      try {
        response = await fetch('/api/process-reference', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(ref),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          throw new Error('Request timeout: Processing took too long (2 minutes)');
        }
        throw fetchError;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ 
          error: `HTTP ${response.status}: ${response.statusText}` 
        }));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const data: ProcessReferenceResponse = await response.json();

      if (data.status === 'downloaded' && data.pdfBase64) {
        // Store PDF buffer
        const byteCharacters = atob(data.pdfBase64);
        const byteNumbers = Array.from(byteCharacters, (c) => c.charCodeAt(0));
        const byteArray = new Uint8Array(byteNumbers);
        pdfBuffersRef.current.set(ref.id, byteArray);
      }

      // Update status
      setReferences((prev) =>
        prev.map((r) =>
          r.id === ref.id
            ? {
                ...r,
                status: data.status,
                pdfFilename: data.pdfFilename,
                error: data.error,
              }
            : r
        )
      );

      setProcessedCount((prev) => prev + 1);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Network error';
      setReferences((prev) =>
        prev.map((r) =>
          r.id === ref.id
            ? { ...r, status: 'failed' as const, error: errorMessage }
            : r
        )
      );
      setProcessedCount((prev) => prev + 1);
    }
  };

  /**
   * Process a batch of references in parallel
   * Uses server-side batch processing for better performance
   * Only use for larger batches (10+ references)
   */
  const processReferenceBatch = async (
    batch: { id: number; title: string; sourceUrl: string }[],
    batchSize: number = 15
  ) => {
    // Mark all as processing
    setReferences((prev) =>
      prev.map((r) => {
        const inBatch = batch.some((b) => b.id === r.id);
        return inBatch ? { ...r, status: 'processing' as const } : r;
      })
    );

    try {
      // Use optimized timeout: 4 minutes (240s) to stay well under Vercel's 300s limit
      // Account for network overhead and processing time
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 240000); // 4 minutes

      let response: Response;
      try {
        response = await fetch('/api/process-references-batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            references: batch,
            batchSize: batchSize 
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          // Mark all as failed due to timeout
          setReferences((prev) =>
            prev.map((r) => {
              const inBatch = batch.some((b) => b.id === r.id);
              return inBatch
                ? { ...r, status: 'failed' as const, error: 'Request timeout: Batch processing took too long (4 minutes)' }
                : r;
            })
          );
          setProcessedCount((prev) => prev + batch.length);
          return;
        }
        throw fetchError;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ 
          error: `HTTP ${response.status}: ${response.statusText}` 
        }));
        // Mark all as failed
        setReferences((prev) =>
          prev.map((r) => {
            const inBatch = batch.some((b) => b.id === r.id);
            return inBatch
              ? { ...r, status: 'failed' as const, error: errorData.error || `Server error: ${response.status}` }
              : r;
          })
        );
        setProcessedCount((prev) => prev + batch.length);
        return;
      }

      const data = await response.json();
      const { results } = data;

      // Update references with results
      setReferences((prev) =>
        prev.map((r) => {
          const result = results.find((res: ProcessReferenceResponse) => res.id === r.id);
          if (result) {
            // Store PDF buffer if downloaded
            if (result.status === 'downloaded' && result.pdfBase64) {
              const byteCharacters = atob(result.pdfBase64);
              const byteNumbers = Array.from(byteCharacters, (c) => c.charCodeAt(0));
              const byteArray = new Uint8Array(byteNumbers);
              pdfBuffersRef.current.set(r.id, byteArray);
            }
            return {
              ...r,
              status: result.status,
              pdfFilename: result.pdfFilename,
              error: result.error,
            };
          }
          return r;
        })
      );

      setProcessedCount((prev) => prev + batch.length);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Network error';
      // Mark all as failed
      setReferences((prev) =>
        prev.map((r) => {
          const inBatch = batch.some((b) => b.id === r.id);
          return inBatch
            ? { ...r, status: 'failed' as const, error: errorMessage }
            : r;
        })
      );
      setProcessedCount((prev) => prev + batch.length);
    }
  };

  const createZipFromBuffers = async (refs: ReferenceStatus[]) => {
    // Get only successfully downloaded references
    const downloadedRefs = refs.filter((r) => r.status === 'downloaded' && r.sourceUrl);

    if (downloadedRefs.length === 0) return null;

    // Limit to 250 files max
    if (downloadedRefs.length > 250) {
      throw new Error(`Too many files (${downloadedRefs.length}). Maximum 250 files per ZIP.`);
    }

    try {
      // Send only reference metadata (small payload) - server will re-process them
      const referencesPayload = downloadedRefs.map((ref) => ({
        id: ref.id,
        title: ref.title,
        sourceUrl: ref.sourceUrl,
      }));

      // Add timeout for ZIP creation (4 minutes - stays under Vercel's 300s limit with buffer)
      // Processing happens in parallel batches, so should be faster
      const zipController = new AbortController();
      const zipTimeout = setTimeout(() => zipController.abort(), 240000); // 4 minutes

      let response: Response;
      try {
        response = await fetch('/api/create-zip', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ references: referencesPayload }),
          signal: zipController.signal,
        });
        clearTimeout(zipTimeout);
      } catch (fetchError) {
        clearTimeout(zipTimeout);
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          throw new Error('ZIP creation timeout: Request took longer than 5 minutes. Try again or contact support if the issue persists.');
        }
        throw new Error(`Network error: ${fetchError instanceof Error ? fetchError.message : 'Failed to connect'}`);
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ 
          error: `HTTP ${response.status}: ${response.statusText}` 
        }));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.zipBase64) {
        throw new Error('No ZIP data returned from server');
      }

      return data.zipBase64;
    } catch (err) {
      console.error('Failed to create ZIP:', err);
      throw err; // Re-throw to let caller handle it
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setReferences([]);
    setProcessedCount(0);
    setStartTime(null);
    setEstimatedTimeRemaining(null);
    pdfBuffersRef.current.clear();

    try {
      // Step 1: Extract references with timeout
      const extractController = new AbortController();
      const extractTimeout = setTimeout(() => extractController.abort(), 60000); // 1 minute

      let extractResponse: Response;
      try {
        extractResponse = await fetch('/api/extract-references', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ wikiUrl }),
          signal: extractController.signal,
        });
        clearTimeout(extractTimeout);
      } catch (fetchError) {
        clearTimeout(extractTimeout);
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          setError('Request timeout: Failed to extract references (took longer than 1 minute)');
        } else {
          setError(`Network error: ${fetchError instanceof Error ? fetchError.message : 'Failed to connect to server'}`);
        }
        setLoading(false);
        return;
      }

      if (!extractResponse.ok) {
        const errorData = await extractResponse.json().catch(() => ({ 
          error: `HTTP ${extractResponse.status}: ${extractResponse.statusText}` 
        }));
        setError(errorData.error || `Failed to extract references: ${extractResponse.status}`);
        setLoading(false);
        return;
      }

      const extractData: ExtractReferencesResponse = await extractResponse.json();
      setArticleTitle(extractData.articleTitle);
      if (extractData.metadata) {
        // Add references count to metadata for display
        const metadataWithRefs = {
          ...extractData.metadata,
          referencesCount: extractData.references.length,
        };
        setArticleMetadata(metadataWithRefs as ArticleMetadata & { referencesCount?: number });
      }

      // Generate shareable URL
      const slugData = extractWikipediaSlug(wikiUrl);
      if (slugData) {
        const slug = encodeURIComponent(`${slugData.lang}:${slugData.slug}`);
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
        setShareableUrl(`${baseUrl}/wiki/${slug}`);
        
        // Update URL without page reload
        if (typeof window !== 'undefined') {
          window.history.pushState({}, '', `/wiki/${slug}`);
        }
      }

      if (extractData.references.length === 0) {
        setResult({
          articleTitle: extractData.articleTitle,
          totalReferences: 0,
          successCount: 0,
          failedCount: 0,
          references: [],
        });
        setLoading(false);
        return;
      }

      // Initialize references with pending status
      const initialReferences: ReferenceStatus[] = extractData.references.map((ref) => ({
        ...ref,
        status: 'pending',
      }));
      setReferences(initialReferences);
      setStartTime(Date.now());

      // Step 2: Process references with controlled client-side parallelism
      // Best practice: Process 4 references concurrently on client side
      // Each request is independent, so failures don't cascade
      // This is 3-4x faster than sequential but safer than server-side batch processing
      const totalReferences = extractData.references.length;
      const concurrency = Math.min(4, totalReferences); // Process 4 at a time (optimal balance)
      
      console.log(`Processing ${totalReferences} references with ${concurrency} concurrent requests`);

      try {
        // Process with controlled concurrency using a worker pool pattern
        // This ensures we never exceed the concurrency limit
        const processWithConcurrency = async (
          items: { id: number; title: string; sourceUrl: string }[],
          limit: number
        ) => {
          let index = 0;

          const worker = async () => {
            while (true) {
              // Atomically get next index (JavaScript is single-threaded, so this is safe)
              const currentIndex = index++;
              if (currentIndex >= items.length) break;

              const ref = items[currentIndex];
              await processReference(ref);
            }
          };

          // Start workers up to concurrency limit
          const workers = Array(Math.min(limit, items.length))
            .fill(null)
            .map(() => worker());

          // Wait for all workers to complete
          await Promise.all(workers);
        };

        await processWithConcurrency(extractData.references, concurrency);

        // Retry failed references once (only for network/timeout errors, not permanent failures)
        // Get current state of references for retry logic
        let currentRefs: ReferenceStatus[] = [];
        await new Promise<void>((resolve) => {
          setReferences((refs) => {
            currentRefs = refs;
            resolve();
            return refs;
          });
        });

        const failedRefs = currentRefs.filter(r => r.status === 'failed' && r.error && 
          (r.error.includes('timeout') || r.error.includes('Network') || r.error.includes('fetch')));
        
        if (failedRefs.length > 0) {
          console.log(`Retrying ${failedRefs.length} failed references...`);
          
          // Sequential retry - reliable approach
          for (const ref of failedRefs) {
            await processReference({
              id: ref.id,
              title: ref.title,
              sourceUrl: ref.sourceUrl,
            });
            await new Promise((resolve) => setTimeout(resolve, 300)); // Small delay between retries
          }
        }
      } catch (processingError) {
        console.error('Error during reference processing:', processingError);
        // Continue to show partial results
      }

      // Wait a bit for state to update
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Step 3: Get final references state
      let finalRefs: ReferenceStatus[] = [];
      await new Promise<void>((resolve) => {
        setReferences((refs) => {
          finalRefs = refs;
          resolve();
          return refs;
        });
      });

      // Step 4: Create ZIP (optional, don't fail if this fails)
      let zipBase64: string | null = null;
      try {
        zipBase64 = await createZipFromBuffers(finalRefs);
      } catch (zipError) {
        console.error('ZIP creation failed, but continuing with results:', zipError);
        // Continue without ZIP - user can create it later via the button
      }

      // Step 5: Set final result (always show results, even if some failed)
      const successCount = finalRefs.filter((r) => r.status === 'downloaded').length;
      const failedCount = finalRefs.filter((r) => r.status === 'failed').length;
      const pendingCount = finalRefs.filter((r) => r.status === 'pending').length;

      // Show warning if there are still pending items
      if (pendingCount > 0) {
        setError(`Warning: ${pendingCount} reference(s) were not processed. Processing may have been interrupted.`);
      }

      setResult({
        articleTitle: extractData.articleTitle,
        totalReferences: extractData.references.length,
        successCount,
        failedCount,
        zipBase64: zipBase64 || undefined,
        references: finalRefs.map((r) => ({
          id: r.id,
          title: r.title,
          sourceUrl: r.sourceUrl,
          status: r.status === 'downloaded' ? 'downloaded' : r.status === 'pending' ? 'failed' : 'failed',
          pdfFilename: r.pdfFilename,
          error: r.error || (r.status === 'pending' ? 'Processing was interrupted' : undefined),
        })),
      });
    } catch (err) {
      console.error('Error in handleSubmit:', err);
      
      // Try to show partial results if we have any (show all non-pending references)
      const currentRefs = references.filter((r) => r.status !== 'pending');
      if (currentRefs.length > 0) {
        const successCount = currentRefs.filter((r) => r.status === 'downloaded').length;
        const failedCount = currentRefs.filter((r) => r.status === 'failed').length;
        
        setResult({
          articleTitle: articleTitle || 'Partial Results',
          totalReferences: references.length,
          successCount,
          failedCount,
          references: currentRefs.map((r) => ({
            id: r.id,
            title: r.title,
            sourceUrl: r.sourceUrl,
            status: r.status === 'downloaded' ? 'downloaded' : 'failed',
            pdfFilename: r.pdfFilename,
            error: r.error || 'Processing was interrupted',
          })),
        });
      }
      
      // Provide more specific error messages
      let errorMessage = 'An unexpected error occurred';
      
      if (err instanceof Error) {
        if (err.name === 'AbortError' || err.message.includes('timeout')) {
          errorMessage = 'Request timeout: Processing took too long. Partial results are shown below.';
        } else if (err.message.includes('Network') || err.message.includes('fetch')) {
          errorMessage = `Network error: ${err.message}. Please check your connection and try again.`;
        } else if (err.message.includes('Failed to extract')) {
          errorMessage = err.message;
        } else {
          errorMessage = err.message || 'An unexpected error occurred';
        }
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
      setStartTime(null);
      setEstimatedTimeRemaining(null);
    }
  };

  const handleDownloadZip = async () => {
    if (!result || result.successCount === 0) return;

    // Disable button during processing
    const button = document.querySelector('[data-download-zip]') as HTMLButtonElement;
    if (button) {
      button.disabled = true;
      button.textContent = 'Creating ZIP...';
    }

    try {
      // Get current references with downloaded status
      const downloadedRefs = references.filter((r) => r.status === 'downloaded' && pdfBuffersRef.current.has(r.id));
      
      if (downloadedRefs.length === 0) {
        setError('No downloaded files available');
        if (button) {
          button.disabled = false;
          button.textContent = `Download ZIP (${result.successCount} files)`;
        }
        return;
      }

      // Create ZIP on-demand from current buffers
      const zipBase64 = await createZipFromBuffers(references);
      
      if (!zipBase64) {
        setError('Failed to create ZIP file. Please try again.');
        if (button) {
          button.disabled = false;
          button.textContent = `Download ZIP (${result.successCount} files)`;
        }
        return;
      }

      // Download the ZIP
      const byteCharacters = atob(zipBase64);
      const byteNumbers = Array.from(byteCharacters, (c) => c.charCodeAt(0));
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${articleTitle || 'wikipedia-refs'}.zip`.replace(/[^a-z0-9._-]/gi, '_');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Clear any previous errors
      setError(null);
    } catch (err) {
      console.error('Failed to download ZIP:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to download ZIP: ${errorMessage}`);
    } finally {
      // Re-enable button
      if (button) {
        button.disabled = false;
        button.textContent = `Download ZIP (${result.successCount} files)`;
      }
    }
  };

  const handleExportCSV = () => {
    if (!result) return;

    try {
      // CSV header
      const headers = ['#', 'Title', 'Source URL', 'Status', 'Error'];
      
      // CSV rows
      const rows = result.references.map((ref) => {
        const title = `"${ref.title.replace(/"/g, '""')}"`;
        const url = `"${ref.sourceUrl.replace(/"/g, '""')}"`;
        const status = ref.status;
        const error = ref.error ? `"${ref.error.replace(/"/g, '""')}"` : '';
        return [ref.id, title, url, status, error].join(',');
      });

      // Combine header and rows
      const csvContent = [headers.join(','), ...rows].join('\n');

      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wikipedia-refs-${result.articleTitle.replace(/[^a-z0-9]/gi, '_')}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to export CSV file');
    }
  };

  const handleDownloadIndividual = (refId: number, pdfFilename?: string) => {
    const pdfBuffer = pdfBuffersRef.current.get(refId);
    if (!pdfBuffer) {
      setError('PDF file not available. Please try downloading the ZIP file instead.');
      return;
    }

    try {
      // Create blob from buffer - create a new ArrayBuffer copy for type compatibility
      const arrayBuffer = new ArrayBuffer(pdfBuffer.length);
      const newUint8Array = new Uint8Array(arrayBuffer);
      newUint8Array.set(pdfBuffer);
      const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Use the stored filename or generate one
      const filename = pdfFilename || `reference-${refId}.pdf`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to download PDF file');
    }
  };

  const truncateUrl = (url: string, maxLength: number = 50) => {
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength) + '...';
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  };

  const progress = references.length > 0 ? (processedCount / references.length) * 100 : 0;
  const successCount = references.filter((r) => r.status === 'downloaded').length;
  const failedCount = references.filter((r) => r.status === 'failed').length;
  const processingCount = references.filter((r) => r.status === 'processing').length;

  return (
    <div className="min-h-screen bg-white dark:bg-black transition-colors duration-200 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="relative mb-6">
          {/* Mobile Layout: Horizontal with icons on sides */}
          <div className="flex sm:hidden items-center justify-between mb-4">
            <a 
              href="/" 
              onClick={(e) => {
                e.preventDefault();
                resetToHome();
              }}
              className="flex-shrink-0 hover:opacity-80 transition-opacity"
              title="Go to home"
            >
              <img 
                src="/wiki-icon.png" 
                alt="Wikipedia" 
                className="w-8 h-8"
              />
            </a>
            <h1 className="flex-1 text-xl font-bold text-gray-900 dark:text-white text-left ml-4" style={{ fontFamily: "'Linux Libertine', 'Georgia', 'Times', 'Source Serif 4', serif" }}>
              Wikipedia Reference Downloader
            </h1>
            {(references.length > 0 || result) && (
              <button
                onClick={resetToHome}
                className="flex-shrink-0 ml-4 p-2 rounded-lg bg-gray-100 dark:bg-gray-900 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors border border-gray-200 dark:border-gray-800"
                aria-label="Start over / Return to home"
                title="Start over"
              >
                <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
                </svg>
              </button>
            )}
          </div>
          
          {/* Desktop Layout: Centered */}
          <div className="hidden sm:flex flex-col items-center text-center mb-6">
            <div className="flex items-center gap-2 mb-2">
              <a 
                href="/" 
                onClick={(e) => {
                  e.preventDefault();
                  resetToHome();
                }}
                className="flex-shrink-0 hover:opacity-80 transition-opacity"
                title="Go to home"
              >
                <img 
                  src="/wiki-icon.png" 
                  alt="Wikipedia" 
                  className="w-10 h-10"
                />
              </a>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white" style={{ fontFamily: "'Linux Libertine', 'Georgia', 'Times', 'Source Serif 4', serif" }}>
                Wikipedia Reference Downloader
              </h1>
            </div>
            <p className="text-base text-gray-600 dark:text-gray-400">
              Paste a Wikipedia article URL to extract and download all external references as PDFs
            </p>
            {(references.length > 0 || result) && (
              <button
                onClick={resetToHome}
                className="absolute top-0 right-0 p-2 rounded-lg bg-gray-100 dark:bg-gray-900 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors border border-gray-200 dark:border-gray-800 flex-shrink-0"
                aria-label="Start over / Return to home"
                title="Start over"
              >
                <svg className="w-6 h-6 text-gray-700 dark:text-gray-300" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
                </svg>
              </button>
            )}
          </div>
          
          {/* Description text for mobile */}
          <p className="sm:hidden text-sm text-gray-600 dark:text-gray-400 text-center mb-6">
            Paste a Wikipedia article URL to extract and download all external references as PDFs
          </p>
        </div>

        {/* Search Form - Moved above hero section */}
        <form onSubmit={handleSubmit} className="mb-8">
          <div className="flex flex-col sm:flex-row gap-4">
            <input
              type="url"
              value={wikiUrl}
              onChange={(e) => setWikiUrl(e.target.value)}
              placeholder="https://en.wikipedia.org/wiki/..."
              className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-800 rounded-lg bg-white dark:bg-black text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-500 focus:border-transparent transition-colors"
              disabled={loading}
              autoComplete="url"
              spellCheck={false}
            />
            <button
              type="submit"
              disabled={loading || !wikiUrl.trim()}
              className={`w-full sm:w-auto px-6 py-3 text-white rounded-lg transition-colors font-medium ${
                loading
                  ? 'bg-gray-300 dark:bg-gray-800 text-gray-500 dark:text-gray-600 cursor-not-allowed'
                  : wikiUrl.trim() 
                    ? 'bg-green-600 dark:bg-green-500 hover:bg-green-700 dark:hover:bg-green-600 cursor-pointer' 
                    : 'bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 cursor-not-allowed'
              }`}
            >
              {loading ? 'Processing...' : wikiUrl.trim() ? 'Fetch & Download References' : 'Paste URL'}
            </button>
          </div>
        </form>

        {/* Hero Section - Only show when no results or processing */}
        {!loading && references.length === 0 && !result && (
          <div className="mb-12 text-center">
            <div className="mb-8">
              <img 
                src="/wiki-reference-downloader.png" 
                alt="Wikipedia Reference Downloader" 
                className="w-full max-w-2xl mx-auto rounded-xl shadow-lg dark:shadow-none border border-gray-200 dark:border-gray-800"
              />
            </div>
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-800">
                  <div className="text-2xl mb-2">⚡</div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Fast & Simple</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Paste a URL and get all references bundled in a ZIP file
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-800">
                  <div className="text-2xl mb-2">📚</div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Complete Collection</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Download all external citations from any Wikipedia article
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-800">
                  <div className="text-2xl mb-2">🔒</div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Offline Access</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Get all reference PDFs for offline reading and research
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Show metadata while loading, even before processing starts */}
        {loading && articleMetadata && references.length === 0 && (
          <div className="bg-white dark:bg-black rounded-xl shadow-lg dark:shadow-none p-6 border border-gray-200 dark:border-gray-800 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              {articleTitle || 'Analyzing Article...'}
            </h2>
            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800">
              {articleMetadata.summary && (
                <>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-3 italic">
                    {articleMetadata.summary}
                  </p>
                  <hr className="border-gray-200 dark:border-gray-800 mb-3" />
                </>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {articleMetadata.lastModified && (
                  <div>
                    <span className="text-gray-500 dark:text-gray-400 font-medium">Last Modified:</span>
                    <p className="text-gray-900 dark:text-white mt-1">{articleMetadata.lastModified}</p>
                  </div>
                )}
                {articleMetadata.editCount && (
                  <div>
                    <span className="text-gray-500 dark:text-gray-400 font-medium">Edits:</span>
                    <p className="text-gray-900 dark:text-white mt-1">{articleMetadata.editCount.toLocaleString()}</p>
                  </div>
                )}
                {articleMetadata.wordCount && (
                  <div>
                    <span className="text-gray-500 dark:text-gray-400 font-medium">Words:</span>
                    <p className="text-gray-900 dark:text-white mt-1">{articleMetadata.wordCount.toLocaleString()}</p>
                  </div>
                )}
                {articleMetadata.articleLength && (
                  <div>
                    <span className="text-gray-500 dark:text-gray-400 font-medium">Length:</span>
                    <p className="text-gray-900 dark:text-white mt-1 capitalize">{articleMetadata.articleLength}</p>
                  </div>
                )}
                {articleMetadata.languages && (
                  <div>
                    <span className="text-gray-500 dark:text-gray-400 font-medium">Languages:</span>
                    <p className="text-gray-900 dark:text-white mt-1">{articleMetadata.languages}</p>
                  </div>
                )}
                {(references.length > 0 || (articleMetadata as any)?.referencesCount) && (
                  <div>
                    <span className="text-gray-500 dark:text-gray-400 font-medium">References:</span>
                    <p className="text-gray-900 dark:text-white mt-1">{references.length || (articleMetadata as any)?.referencesCount || 0}</p>
                  </div>
                )}
              </div>
              {articleMetadata.infoboxData && Object.keys(articleMetadata.infoboxData).length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800">
                  <span className="text-gray-500 dark:text-gray-400 font-medium text-xs mb-2 block">Quick Facts:</span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {Object.entries(articleMetadata.infoboxData).slice(0, 4).map(([key, value]) => (
                      <div key={key}>
                        <span className="text-gray-500 dark:text-gray-400 font-medium">{key}:</span>
                        <span className="text-gray-700 dark:text-gray-300 ml-1">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {articleMetadata.categories && articleMetadata.categories.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800">
                  <span className="text-gray-500 dark:text-gray-400 font-medium text-xs">Categories: </span>
                  <span className="text-gray-700 dark:text-gray-300 text-xs">
                    {articleMetadata.categories.join(', ')}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {loading && references.length > 0 && (
          <div className="bg-white dark:bg-black rounded-xl shadow-lg dark:shadow-none p-6 border border-gray-200 dark:border-gray-800 mb-6">
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {articleTitle || 'Processing...'}
                </h2>
                {estimatedTimeRemaining !== null && isFinite(estimatedTimeRemaining) ? (
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    ~{formatTime(estimatedTimeRemaining)} remaining
                  </span>
                ) : processedCount === 0 ? (
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Analyzing...
                  </span>
                ) : null}
              </div>

              {/* Article Metadata Display */}
              {articleMetadata && (
                <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800">
                  {articleMetadata.summary && (
                    <>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-3 italic">
                        {articleMetadata.summary}
                      </p>
                      <hr className="border-gray-200 dark:border-gray-800 mb-3" />
                    </>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    {articleMetadata.lastModified && (
                      <div>
                        <span className="text-gray-500 dark:text-gray-400 font-medium">Last Modified:</span>
                        <p className="text-gray-900 dark:text-white mt-1">{articleMetadata.lastModified}</p>
                      </div>
                    )}
                    {articleMetadata.editCount && (
                      <div>
                        <span className="text-gray-500 dark:text-gray-400 font-medium">Edits:</span>
                        <p className="text-gray-900 dark:text-white mt-1">{articleMetadata.editCount.toLocaleString()}</p>
                      </div>
                    )}
                    {articleMetadata.wordCount && (
                      <div>
                        <span className="text-gray-500 dark:text-gray-400 font-medium">Words:</span>
                        <p className="text-gray-900 dark:text-white mt-1">{articleMetadata.wordCount.toLocaleString()}</p>
                      </div>
                    )}
                    {articleMetadata.articleLength && (
                      <div>
                        <span className="text-gray-500 dark:text-gray-400 font-medium">Length:</span>
                        <p className="text-gray-900 dark:text-white mt-1 capitalize">{articleMetadata.articleLength}</p>
                      </div>
                    )}
                    {articleMetadata.languages && (
                      <div>
                        <span className="text-gray-500 dark:text-gray-400 font-medium">Languages:</span>
                        <p className="text-gray-900 dark:text-white mt-1">{articleMetadata.languages}</p>
                      </div>
                    )}
                    {(references.length > 0 || (articleMetadata as any)?.referencesCount) && (
                      <div>
                        <span className="text-gray-500 dark:text-gray-400 font-medium">References:</span>
                        <p className="text-gray-900 dark:text-white mt-1">{references.length || (articleMetadata as any)?.referencesCount || 0}</p>
                      </div>
                    )}
                  </div>
                  {articleMetadata.infoboxData && Object.keys(articleMetadata.infoboxData).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800">
                      <span className="text-gray-500 dark:text-gray-400 font-medium text-xs mb-2 block">Quick Facts:</span>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {Object.entries(articleMetadata.infoboxData).slice(0, 4).map(([key, value]) => (
                          <div key={key}>
                            <span className="text-gray-500 dark:text-gray-400 font-medium">{key}:</span>
                            <span className="text-gray-700 dark:text-gray-300 ml-1">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {articleMetadata.categories && articleMetadata.categories.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800">
                      <span className="text-gray-500 dark:text-gray-400 font-medium text-xs">Categories: </span>
                      <span className="text-gray-700 dark:text-gray-300 text-xs">
                        {articleMetadata.categories.join(', ')}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-blue-600 dark:bg-blue-500 h-full rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-2 text-sm text-gray-600 dark:text-gray-400">
                <span>
                  {processedCount} / {references.length} processed
                </span>
                <span>{Math.round(progress)}%</span>
              </div>
            </div>

            <div className="mt-4 space-y-2 max-h-96 overflow-y-auto">
              {references.map((ref) => (
                <div
                  key={ref.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        #{ref.id}
                      </span>
                      <span className="text-sm text-gray-900 dark:text-white truncate">
                        {ref.title}
                      </span>
                    </div>
                  </div>
                  <div className="ml-4">
                    {ref.status === 'pending' && (
                      <span className="px-2 py-1 text-xs rounded-full bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                        Pending
                      </span>
                    )}
                    {ref.status === 'processing' && (
                      <span className="px-2 py-1 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 flex items-center gap-1">
                        <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Processing
                      </span>
                    )}
                    {ref.status === 'downloaded' && (
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 text-xs rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                          ✓ Downloaded
                        </span>
                        <button
                          onClick={() => handleDownloadIndividual(ref.id, ref.pdfFilename)}
                          className="px-2 py-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline flex items-center gap-1 transition-colors"
                          title={`Download ${ref.pdfFilename || 'PDF'}`}
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Download
                        </button>
                      </div>
                    )}
                    {ref.status === 'failed' && (
                      <div className="relative error-popup-container">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleErrorExpansion(ref.id);
                          }}
                          className="px-2 py-1 text-xs rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors cursor-pointer flex items-center gap-1"
                          title={ref.error || 'Click to see error details'}
                        >
                          ✗ Failed
                          {ref.error && (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={expandedErrors.has(ref.id) ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
                            </svg>
                          )}
                        </button>
                        {expandedErrors.has(ref.id) && ref.error && (
                          <div className="absolute right-0 top-full mt-2 w-64 p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg shadow-lg z-10">
                            <div className="text-xs font-semibold text-red-800 dark:text-red-300 mb-1">Error:</div>
                            <div className="text-xs text-red-700 dark:text-red-400 break-words">{ref.error}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-black rounded-xl shadow-lg dark:shadow-none p-6 border border-gray-200 dark:border-gray-800 transition-colors">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
                  {result.articleTitle}
                </h2>
                {shareableUrl && (
                  <button
                    data-share-button
                    onClick={handleShare}
                    className="px-4 py-2 text-sm bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors font-medium flex items-center gap-2"
                    title="Copy shareable link"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                    Share
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6">
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 sm:p-4 border border-gray-200 dark:border-gray-800">
                  <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-1">Total References</div>
                  <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                    {result.totalReferences}
                  </div>
                </div>
                <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3 sm:p-4 border border-green-200 dark:border-green-900">
                  <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-1">Downloaded</div>
                  <div className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400">
                    {result.successCount}
                  </div>
                </div>
                <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-3 sm:p-4 border border-red-200 dark:border-red-900">
                  <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-1">Failed</div>
                  <div className="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-400">
                    {result.failedCount}
                  </div>
                </div>
              </div>

              {result.successCount > 0 && (
                <button
                  data-download-zip
                  onClick={handleDownloadZip}
                  className="w-full px-4 py-3 bg-green-600 dark:bg-green-500 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={loading}
                >
                  Download ZIP ({result.successCount} files)
                </button>
              )}
            </div>

            <div className="bg-white dark:bg-black rounded-xl shadow-lg dark:shadow-none overflow-hidden border border-gray-200 dark:border-gray-800 transition-colors">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  References
                </h3>
                <button
                  onClick={handleExportCSV}
                  className="px-4 py-2 text-sm bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors font-medium flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Export CSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        #
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Title
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Source URL
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-black divide-y divide-gray-200 dark:divide-gray-800">
                    {result.references.map((ref) => (
                      <tr key={ref.id} className="hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-medium">
                          {ref.id}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-white max-w-md">
                          <div className="break-words">{ref.title}</div>
                        </td>
                        <td className="px-6 py-4 text-sm max-w-xs">
                          <a
                            href={ref.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 hover:underline break-all"
                            title={ref.sourceUrl}
                          >
                            {ref.sourceUrl.length > 50
                              ? `${ref.sourceUrl.substring(0, 50)}...`
                              : ref.sourceUrl}
                          </a>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm min-w-[120px]">
                          {ref.status === 'downloaded' ? (
                            <div className="flex items-center gap-2">
                              <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-900">
                                Downloaded
                              </span>
                              <button
                                onClick={() => handleDownloadIndividual(ref.id, ref.pdfFilename)}
                                className="px-2 py-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline flex items-center gap-1 transition-colors"
                                title={`Download ${ref.pdfFilename || 'PDF'}`}
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                Download
                              </button>
                            </div>
                          ) : (
                            <div className="relative inline-block error-popup-container">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleErrorExpansion(ref.id);
                                }}
                                className="px-3 py-1 inline-flex items-center gap-1 text-xs leading-5 font-semibold rounded-full bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-900 hover:bg-red-200 dark:hover:bg-red-900/70 transition-colors cursor-pointer"
                                title={ref.error || 'Click to see error details'}
                              >
                                Failed
                                {ref.error && (
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={expandedErrors.has(ref.id) ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
                                  </svg>
                                )}
                              </button>
                              {expandedErrors.has(ref.id) && ref.error && (
                                <div className="absolute right-0 top-full mt-2 w-80 p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg shadow-lg z-10">
                                  <div className="text-xs font-semibold text-red-800 dark:text-red-300 mb-1">Error Details:</div>
                                  <div className="text-xs text-red-700 dark:text-red-400 break-words">{ref.error}</div>
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        </div>
    </div>
  );
}
