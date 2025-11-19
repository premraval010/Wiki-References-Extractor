# WhatsApp Open Graph Image Fix

## Issue
WhatsApp wasn't showing the SEO image when sharing links.

## Solution Applied

1. **Changed image URLs to absolute URLs**
   - Before: `/wiki-reference-downloader.jpg` (relative)
   - After: `https://wiki-ref-downloader.vercel.app/wiki-reference-downloader.jpg` (absolute)

2. **Added image type metadata**
   - Added `type: "image/png"` to Open Graph image configuration

3. **Used environment variable for base URL**
   - Uses `NEXT_PUBLIC_BASE_URL` if set, otherwise falls back to default

## Important Notes for WhatsApp

WhatsApp has specific requirements for Open Graph images:

- ✅ **Absolute URL required** - Relative URLs don't work
- ✅ **Minimum size**: 200x200px (your image is 1536x1024)
- ✅ **Recommended size**: 1200x630px (1.91:1 ratio) for optimal display
- ✅ **Max file size**: 8MB
- ✅ **Supported formats**: JPG, PNG, WebP, GIF
- ✅ **HTTPS required** - Image must be served over HTTPS

## Testing

After deploying:

1. **Test the image URL directly**:
   - Visit: `https://your-domain.vercel.app/wiki-reference-downloader.jpg`
   - Should load the image successfully

2. **Test Open Graph tags**:
   - Use Facebook's Sharing Debugger: https://developers.facebook.com/tools/debug/
   - Or WhatsApp's link preview (share the link in WhatsApp)

3. **Clear WhatsApp cache** (if image still doesn't show):
   - WhatsApp caches link previews
   - Try sharing the link with `?v=1` or `?t=timestamp` to force refresh
   - Or wait a few hours for cache to expire

## Environment Variable

Make sure `NEXT_PUBLIC_BASE_URL` is set in Vercel:
- Go to Vercel Dashboard → Settings → Environment Variables
- Add: `NEXT_PUBLIC_BASE_URL` = `https://your-actual-domain.vercel.app`
- Redeploy after adding

## Verification

Check the page source after deployment:
```html
<meta property="og:image" content="https://your-domain.vercel.app/wiki-reference-downloader.jpg" />
```

The URL should be absolute, not relative.

