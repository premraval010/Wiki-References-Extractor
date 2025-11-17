# Deployment Guide

## Deploy to Vercel

### Prerequisites
- GitHub account
- Vercel account (sign up at [vercel.com](https://vercel.com))

### Steps

1. **Push to GitHub** (if not already done):
   ```bash
   git add .
   git commit -m "Prepare for Vercel deployment"
   git push origin main
   ```

2. **Deploy on Vercel**:
   - Go to [vercel.com/new](https://vercel.com/new)
   - Import your GitHub repository: `premraval010/Wiki-References-Extractor`
   - Select the root directory: `wiki-ref-downloader`
   - Vercel will auto-detect Next.js
   - Click "Deploy"

3. **Configuration**:
   - The `vercel.json` is already configured with:
     - 300s max duration for API routes (needed for PDF processing)
     - Proper build commands

4. **Environment Variables**:
   - No environment variables needed for basic functionality
   - Vercel automatically sets `VERCEL=1` in production

### Post-Deployment

1. **Test the deployment**:
   - Visit your Vercel URL
   - Try processing a Wikipedia article
   - Verify PDF generation works

2. **Custom Domain** (optional):
   - Go to Project Settings → Domains
   - Add your custom domain

## Google Search Console Setup

### 1. Submit to Google Search Console

1. Go to [Google Search Console](https://search.google.com/search-console)
2. Add your property (your Vercel domain)
3. Verify ownership (Vercel provides DNS verification)
4. Submit your sitemap: `https://your-domain.com/sitemap.xml`

### 2. Create sitemap.xml

A sitemap will be created automatically by Next.js, or you can create a custom one.

### 3. robots.txt

Create `public/robots.txt`:
```
User-agent: *
Allow: /
Sitemap: https://your-domain.com/sitemap.xml
```

## SEO Checklist

- ✅ Meta tags (title, description, keywords)
- ✅ Open Graph tags
- ✅ Twitter Card tags
- ✅ Favicon
- ✅ SEO cover image
- ⏳ Sitemap (create if needed)
- ⏳ robots.txt (create if needed)

## Monitoring

- Check Vercel Analytics for performance
- Monitor API route execution times
- Watch for timeout errors (may need to increase maxDuration)

## Troubleshooting

### Puppeteer Issues on Vercel
- The code automatically uses `@sparticuz/chromium` on Vercel
- If PDF generation fails, check Vercel function logs
- Ensure `maxDuration` is set to 300s in `vercel.json`

### Build Errors
- Check Node.js version (should be 18+)
- Verify all dependencies are in `package.json`
- Check build logs in Vercel dashboard

