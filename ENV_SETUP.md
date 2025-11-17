# Environment Variables Setup

## Required Environment Variable

### `NEXT_PUBLIC_BASE_URL`

**Purpose**: Sets the base URL for SEO metadata, sitemap, and canonical URLs.

**Value**: Your actual Vercel deployment URL (e.g., `https://wiki-ref-downloader.vercel.app`)

## How to Add in Vercel

### Step-by-Step:

1. **Go to Vercel Dashboard**
   - Visit: https://vercel.com/dashboard
   - Select your project: `Wiki-References-Extractor`

2. **Navigate to Settings**
   - Click on **Settings** tab (top navigation)
   - Click on **Environment Variables** (left sidebar)

3. **Add Variable**
   - Click **Add New** button
   - **Key**: `NEXT_PUBLIC_BASE_URL`
   - **Value**: `https://your-actual-domain.vercel.app`
   - **Environments**: Select all (Production, Preview, Development)
   - Click **Save**

4. **Redeploy**
   - Go to **Deployments** tab
   - Find your latest deployment
   - Click the **⋯** (three dots) menu
   - Click **Redeploy**
   - Or push a new commit to trigger auto-deployment

## Alternative: Set During Initial Deployment

If deploying for the first time:

1. On the "Configure Project" page
2. Scroll down to **Environment Variables** section
3. Click **Add** or **Add Another**
4. Enter:
   - Key: `NEXT_PUBLIC_BASE_URL`
   - Value: `https://your-project-name.vercel.app`
5. Continue with deployment

## Verify It's Working

After redeploying, check:

1. **Sitemap**: Visit `https://your-domain.vercel.app/sitemap.xml`
   - Should show your actual domain

2. **Page Source**: View page source on your site
   - Look for `<link rel="canonical">` tag
   - Should show your actual domain

3. **Metadata**: Check Open Graph tags
   - Should reference your actual domain

## Notes

- `NEXT_PUBLIC_*` prefix makes it available in the browser
- Changes require a redeploy to take effect
- You can use different values for Production, Preview, and Development
- If not set, the app uses a default fallback URL

