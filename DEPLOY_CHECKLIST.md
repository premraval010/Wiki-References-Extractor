# Quick Deployment Checklist

## ✅ Pre-Deployment Checklist

- [x] Puppeteer configured for Vercel (`@sparticuz/chromium`)
- [x] `vercel.json` configured with 300s timeout
- [x] Build tested locally (`npm run build`)
- [x] SEO metadata configured
- [x] Sitemap created
- [x] robots.txt created
- [x] Favicon added
- [x] Open Graph image added

## 🚀 Deploy to Vercel

### Step 1: Commit and Push
```bash
cd wiki-ref-downloader
git add .
git commit -m "Prepare for Vercel deployment with Puppeteer support"
git push origin main
```

### Step 2: Deploy on Vercel
1. Go to [vercel.com/new](https://vercel.com/new)
2. Import repository: `premraval010/Wiki-References-Extractor`
3. **Root Directory**: Set to `wiki-ref-downloader`
4. **Framework Preset**: Next.js (auto-detected)
5. Click **Deploy**

### Step 3: Update Domain in Code (After Deployment)
After deployment, update these files with your actual Vercel domain:

1. **`app/layout.tsx`**: Update `metadataBase` URL
2. **`app/sitemap.ts`**: Update `baseUrl` (or set `NEXT_PUBLIC_BASE_URL` env var)
3. **`public/robots.txt`**: Update sitemap URL

Or set environment variable in Vercel:
- `NEXT_PUBLIC_BASE_URL` = `https://your-app.vercel.app`

## 🔍 Google Search Console

1. Go to [search.google.com/search-console](https://search.google.com/search-console)
2. Add property: Your Vercel domain
3. Verify ownership (DNS method via Vercel)
4. Submit sitemap: `https://your-domain.com/sitemap.xml`

## ✅ Post-Deployment

- [ ] Test PDF generation on Vercel
- [ ] Verify dark mode works
- [ ] Test with a Wikipedia article
- [ ] Check Vercel function logs for errors
- [ ] Update robots.txt with actual domain
- [ ] Submit to Google Search Console

## 🐛 Troubleshooting

**Puppeteer errors on Vercel:**
- Check function logs in Vercel dashboard
- Ensure `@sparticuz/chromium` is in dependencies
- Verify `maxDuration: 300` in `vercel.json`

**Build errors:**
- Check Node.js version (should be 18+)
- Verify all dependencies are installed
- Check build logs in Vercel

