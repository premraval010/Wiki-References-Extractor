'use client';

import { useState, useEffect } from 'react';

type AnalyticsData = {
  message: string;
  instructions: {
    vercelAnalytics: {
      description: string;
      steps: string[];
      url: string;
    };
    apiEndpoint: {
      description: string;
      note: string;
      eventData: {
        event: string;
        properties: {
          url: string;
          slug: string;
          title: string;
          referenceCount: string;
          timestamp: string;
        };
      };
    };
  };
  recommendations: string[];
};

export default function AnalyticsPage() {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/get-analytics')
      .then((res) => res.json())
      .then((data) => {
        setAnalyticsData(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-black py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center">Loading analytics information...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white dark:bg-black py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg">
            Error: {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Search Analytics
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            View and analyze Wikipedia article searches
          </p>
        </div>

        {analyticsData && (
          <div className="space-y-6">
            {/* Vercel Analytics Instructions */}
            <div className="bg-white dark:bg-black rounded-xl shadow-lg dark:shadow-none p-6 border border-gray-200 dark:border-gray-800">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                📊 View Analytics in Vercel Dashboard
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {analyticsData.instructions.vercelAnalytics.description}
              </p>
              <ol className="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300 mb-4">
                {analyticsData.instructions.vercelAnalytics.steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
              <a
                href={analyticsData.instructions.vercelAnalytics.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
              >
                Open Vercel Dashboard
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>

            {/* Event Data Structure */}
            <div className="bg-white dark:bg-black rounded-xl shadow-lg dark:shadow-none p-6 border border-gray-200 dark:border-gray-800">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                📝 Tracked Event Data
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {analyticsData.instructions.apiEndpoint.description}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">
                {analyticsData.instructions.apiEndpoint.note}
              </p>
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-800">
                <pre className="text-sm text-gray-700 dark:text-gray-300 overflow-x-auto">
                  {JSON.stringify(analyticsData.instructions.apiEndpoint.eventData, null, 2)}
                </pre>
              </div>
            </div>

            {/* Recommendations */}
            <div className="bg-white dark:bg-black rounded-xl shadow-lg dark:shadow-none p-6 border border-gray-200 dark:border-gray-800">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                💡 Recommendations
              </h2>
              <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
                {analyticsData.recommendations.map((rec, index) => (
                  <li key={index}>{rec}</li>
                ))}
              </ul>
            </div>

            {/* Quick Stats Placeholder */}
            <div className="bg-white dark:bg-black rounded-xl shadow-lg dark:shadow-none p-6 border border-gray-200 dark:border-gray-800">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                📈 Quick Stats
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                To view detailed statistics, visit your Vercel Dashboard Analytics section.
                You can filter by the event name <code className="bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded">wiki_search</code> to see all searches.
              </p>
            </div>
          </div>
        )}

        {/* Back to Home */}
        <div className="mt-8">
          <a
            href="/"
            className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Home
          </a>
        </div>
      </div>
    </div>
  );
}

