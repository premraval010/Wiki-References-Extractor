'use client';

import { useState, useEffect, useRef } from 'react';
import type { ProcessArticleResponse } from '@/app/api/process-article/route';
import type { ExtractReferencesResponse } from '@/app/api/process-article/route';
import type { ProcessReferenceResponse } from '@/app/api/process-reference/route';

type ReferenceStatus = {
  id: number;
  title: string;
  sourceUrl: string;
  status: 'pending' | 'processing' | 'downloaded' | 'failed';
  pdfFilename?: string;
  error?: string;
};

export default function Home() {
  const [wikiUrl, setWikiUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProcessArticleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Progress tracking
  const [articleTitle, setArticleTitle] = useState<string>('');
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

  // Calculate estimated time remaining
  useEffect(() => {
    if (startTime && references.length > 0 && processedCount < references.length) {
      const elapsed = (Date.now() - startTime) / 1000; // seconds
      const avgTimePerRef = elapsed / processedCount;
      const remaining = references.length - processedCount;
      const estimated = Math.ceil(avgTimePerRef * remaining);
      setEstimatedTimeRemaining(estimated);
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

  const processReference = async (ref: { id: number; title: string; sourceUrl: string }) => {
    // Update status to processing
    setReferences((prev) =>
      prev.map((r) => (r.id === ref.id ? { ...r, status: 'processing' as const } : r))
    );

    try {
      const response = await fetch('/api/process-reference', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(ref),
      });

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
      setReferences((prev) =>
        prev.map((r) =>
          r.id === ref.id
            ? { ...r, status: 'failed' as const, error: 'Network error' }
            : r
        )
      );
      setProcessedCount((prev) => prev + 1);
    }
  };

  const createZipFromBuffers = async (refs: ReferenceStatus[]) => {
    const files = Array.from(pdfBuffersRef.current.entries())
      .map(([id, buffer]) => {
        const ref = refs.find((r) => r.id === id);
        return ref && ref.pdfFilename
          ? { filename: ref.pdfFilename, content: buffer }
          : null;
      })
      .filter((f): f is { filename: string; content: Uint8Array } => f !== null);

    if (files.length === 0) return null;

    try {
      const response = await fetch('/api/create-zip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          files: files.map((f) => ({
            filename: f.filename,
            content: Array.from(f.content as Uint8Array),
          })),
        }),
      });

      const data = await response.json();
      return data.zipBase64;
    } catch (err) {
      console.error('Failed to create ZIP:', err);
      return null;
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
      // Step 1: Extract references
      const extractResponse = await fetch('/api/extract-references', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ wikiUrl }),
      });

      if (!extractResponse.ok) {
        const errorData = await extractResponse.json();
        setError(errorData.error || 'Failed to extract references');
        return;
      }

      const extractData: ExtractReferencesResponse = await extractResponse.json();
      setArticleTitle(extractData.articleTitle);

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

      // Step 2: Process references one by one
      for (const ref of extractData.references) {
        await processReference(ref);
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

      // Step 4: Create ZIP
      const zipBase64 = await createZipFromBuffers(finalRefs);

      // Step 5: Set final result
      const successCount = finalRefs.filter((r) => r.status === 'downloaded').length;
      const failedCount = finalRefs.filter((r) => r.status === 'failed').length;

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
          status: r.status === 'downloaded' ? 'downloaded' : 'failed',
          pdfFilename: r.pdfFilename,
          error: r.error,
        })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
      setStartTime(null);
      setEstimatedTimeRemaining(null);
    }
  };

  const handleDownloadZip = () => {
    if (!result?.zipBase64) return;

    try {
      const byteCharacters = atob(result.zipBase64);
      const byteNumbers = Array.from(byteCharacters, (c) => c.charCodeAt(0));
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/zip' });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wikipedia-refs-${result.articleTitle.replace(/[^a-z0-9]/gi, '_')}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to download ZIP file');
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Wikipedia Reference Downloader
          </h1>
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Paste a Wikipedia article URL to extract and download all external references as PDFs
            </p>
          </div>
        </div>

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
              className="w-full sm:w-auto px-6 py-3 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-800 disabled:text-gray-500 dark:disabled:text-gray-600 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {loading ? 'Processing...' : 'Fetch & Download References'}
            </button>
          </div>
        </form>

        {loading && references.length > 0 && (
          <div className="bg-white dark:bg-black rounded-xl shadow-lg dark:shadow-none p-6 border border-gray-200 dark:border-gray-800 mb-6">
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {articleTitle || 'Processing...'}
                </h2>
                {estimatedTimeRemaining !== null && (
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    ~{formatTime(estimatedTimeRemaining)} remaining
                  </span>
                )}
              </div>
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
                      <span className="px-2 py-1 text-xs rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                        ✓ Downloaded
                      </span>
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
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
                {result.articleTitle}
              </h2>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-800">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total References</div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    {result.totalReferences}
                  </div>
                </div>
                <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-4 border border-green-200 dark:border-green-900">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Downloaded</div>
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {result.successCount}
                  </div>
                </div>
                <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-4 border border-red-200 dark:border-red-900">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Failed</div>
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                    {result.failedCount}
                  </div>
                </div>
              </div>

              {result.zipBase64 && (
                <button
                  onClick={handleDownloadZip}
                  className="w-full px-4 py-3 bg-green-600 dark:bg-green-500 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-600 transition-colors font-medium"
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
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                          {ref.title}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <a
                            href={ref.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            {truncateUrl(ref.sourceUrl)}
                          </a>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {ref.status === 'downloaded' ? (
                            <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-900">
                              Downloaded
                            </span>
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
