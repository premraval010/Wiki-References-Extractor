# Search Analytics Guide

## Overview

Your Wikipedia References Downloader now tracks all search queries! Every time someone searches for a Wikipedia article, the following data is captured:

- **Wikipedia URL** - The full URL searched
- **Article Title** - The title of the Wikipedia article
- **Article Slug** - The URL-friendly version of the article name
- **Reference Count** - Number of references found
- **Timestamp** - When the search occurred
- **IP Address** (server-side only)
- **User Agent** (server-side only)

## How to View Analytics

### Method 1: Vercel Analytics Dashboard (Recommended)

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project: `Wiki-References-Extractor`
3. Click on the **"Analytics"** tab
4. Look for custom events named **`wiki_search`**
5. You can filter, sort, and analyze the data there

**What you'll see:**
- Total number of searches
- Most searched articles
- Search trends over time
- Reference count statistics
- Geographic distribution (if available)

### Method 2: Vercel Function Logs

1. Go to your Vercel Dashboard
2. Select your project
3. Click on **"Deployments"** tab
4. Click on any deployment
5. Click on **"Functions"** tab
6. Look for logs containing `[SEARCH_QUERY]`

The logs will show JSON data like:
```json
{
  "event": "wiki_search",
  "url": "https://en.wikipedia.org/wiki/Example",
  "slug": "Example",
  "title": "Example Article",
  "referenceCount": 25,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Method 3: Analytics Page

Visit `/analytics` on your deployed site to see:
- Instructions on how to view analytics
- Event data structure
- Recommendations for advanced analytics

## Event Structure

Each search triggers a Vercel Analytics event with this structure:

```javascript
{
  event: 'wiki_search',
  properties: {
    url: 'https://en.wikipedia.org/wiki/Article_Name',
    slug: 'Article_Name',
    title: 'Article Title',
    referenceCount: 25
  }
}
```

## Advanced Analytics (Future Enhancements)

For more detailed analytics, consider:

1. **Vercel Postgres** - Store search history in a database
2. **Supabase** - Free database with analytics features
3. **Vercel KV** - Redis-based storage for high-performance analytics
4. **Google Analytics** - Additional tracking layer
5. **Custom Dashboard** - Build a custom admin dashboard

## Privacy Considerations

- IP addresses are only logged server-side (in Vercel logs)
- No personal information is collected
- All data is aggregated and anonymized in Vercel Analytics
- You can review Vercel's privacy policy for details

## Querying Analytics Programmatically

You can query Vercel Analytics data using:
- Vercel Analytics API (if available)
- Vercel Logs API
- Custom database queries (if you add a database)

## Troubleshooting

**Not seeing analytics?**
- Make sure Vercel Analytics is enabled in your project
- Check that the `@vercel/analytics` package is installed
- Verify the Analytics component is in your layout

**Want to export data?**
- Use Vercel Dashboard export features
- Query Vercel Logs API
- Set up a database for custom queries

## Next Steps

1. ✅ Analytics tracking is now active
2. Visit Vercel Dashboard to view your data
3. Consider adding a database for long-term storage
4. Build custom dashboards if needed

