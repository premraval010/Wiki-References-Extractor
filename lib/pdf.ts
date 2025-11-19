// Use puppeteer-core for Vercel, regular puppeteer for local dev
let puppeteer: any;
let chromium: any;

if (process.env.VERCEL === '1') {
  // Vercel serverless environment
  puppeteer = require('puppeteer-core');
  chromium = require('@sparticuz/chromium');
} else {
  // Local development
  puppeteer = require('puppeteer');
}

const BLOCK_PAGE_PATTERNS = [
  { regex: /please confirm you are human/i, reason: 'Publisher requires human verification (CAPTCHA).' },
  { regex: /slide right to complete the puzzle/i, reason: 'Publisher requires human verification (slider CAPTCHA).' },
  { regex: /complete the security check/i, reason: 'Publisher requires a security verification (CAPTCHA).' },
  { regex: /press and hold/i, reason: 'Publisher requires human verification (press-and-hold challenge).' },
  { regex: /verify you (are|re) (a )?(human|robot)/i, reason: 'Publisher requires human verification (CAPTCHA).' },
  { regex: /before we can let you continue/i, reason: 'Publisher is gating the content with a verification step.' },
  { regex: /unusual traffic/i, reason: 'Publisher detected unusual traffic and blocked automated access.' },
  { regex: /access denied/i, reason: 'Publisher denied access (likely due to automated detection).' },
  { regex: /article not found/i, reason: 'Publisher reports this article is not available or was removed.' },
  { regex: /page not found/i, reason: 'Publisher reports this page was not found (404).' },
  { regex: /not found on this website/i, reason: 'Publisher reports this page was not found on the site.' },
  { regex: /cf-captcha|cf-chl/i, reason: 'Cloudflare CAPTCHA challenge detected.' },
  { regex: /bot detection/i, reason: 'Publisher triggered bot detection and blocked access.' },
];

function detectAccessBlocker(html: string, pageUrl: string): string | null {
  const lowerHtml = html.toLowerCase();
  const lowerUrl = pageUrl.toLowerCase();

  if (lowerUrl.includes('captcha') || lowerUrl.includes('verify') || lowerUrl.includes('blocked')) {
    return 'Publisher redirected to a verification / CAPTCHA page.';
  }

  for (const indicator of BLOCK_PAGE_PATTERNS) {
    if (indicator.regex.test(lowerHtml)) {
      return indicator.reason;
    }
  }

  if (
    lowerHtml.includes('g-recaptcha') ||
    lowerHtml.includes('hcaptcha') ||
    lowerHtml.includes('cf-turnstile')
  ) {
    return 'Publisher is showing a CAPTCHA widget.';
  }

  return null;
}

/**
 * Checks if a URL points to a PDF file
 */
export function isPdfUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    return pathname.endsWith('.pdf');
  } catch {
    return false;
  }
}

/**
 * Downloads a PDF file directly from a URL
 */
export async function downloadPdf(url: string): Promise<Buffer> {
  const controller = new AbortController();
  // Reduced timeout to 90 seconds to allow for batch processing within Vercel's 300s limit
  const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 seconds timeout

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`Failed to download PDF: ${response.status} ${response.statusText}`);
  }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Failed to download PDF: Request timeout (120s exceeded)');
    }
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Failed to download PDF: Network error or timeout`);
    }
    throw new Error(`Failed to download PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Renders a URL to PDF using Puppeteer
 */
export async function renderUrlToPdf(url: string): Promise<Buffer> {
  let browser;
  let page;
  const maxRetries = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Configure for Vercel serverless or local development
      const isVercel = process.env.VERCEL === '1';
      
      const launchOptions: any = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-http2', // Disable HTTP/2 to avoid protocol errors
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-blink-features=AutomationControlled', // Avoid detection as bot
          '--disable-web-security', // Disable web security to allow cross-origin requests
          '--disable-features=BlockInsecurePrivateNetworkRequests', // Allow insecure requests
          '--disable-features=NetworkService', // Disable network service that might block requests
          '--disable-blink-features=AutomationControlled', // Avoid detection
          '--disable-features=TranslateUI', // Disable translate UI
          '--disable-ipc-flooding-protection', // Disable IPC flooding protection
          '--disable-renderer-backgrounding', // Disable backgrounding renderer
          '--disable-backgrounding-occluded-windows', // Disable backgrounding occluded windows
          '--disable-component-extensions-with-background-pages', // Disable component extensions
          '--disable-default-apps', // Disable default apps
          '--disable-extensions', // Disable extensions (which might block requests)
          '--disable-sync', // Disable sync
          '--metrics-recording-only', // Metrics recording only
          '--mute-audio', // Mute audio
          ...(isVercel && chromium ? chromium.args : []),
        ],
      };

      // Use Chromium binary for Vercel, system Chrome for local
      if (isVercel && chromium) {
        launchOptions.executablePath = await chromium.executablePath();
      }

      browser = await puppeteer.launch(launchOptions);
      page = await browser.newPage();
      
      // Set viewport for consistent rendering
      await page.setViewport({ width: 1200, height: 800 });
      
      // Set user agent to avoid being blocked
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // Track blocked requests to handle ERR_BLOCKED_BY_CLIENT gracefully
      let blockedRequestsCount = 0;
      let hasBlockedRequests = false;

      // Intercept and allow all requests to prevent blocking
      await page.setRequestInterception(true);
      page.on('request', (request: any) => {
        // Allow all requests, don't block anything
        // Override headers to avoid detection and blocking
        const headers = {
          ...request.headers(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        };
        request.continue({ headers });
      });
      
      // Handle page errors and navigation issues
      page.on('error', (err: Error) => {
        console.warn('Page error (non-fatal):', err.message);
      });
      
      // Handle request failures - ERR_BLOCKED_BY_CLIENT is often non-fatal
      // Many sites block ads/trackers but main content still loads
      page.on('requestfailed', (request: any) => {
        const failure = request.failure();
        const errorText = failure?.errorText || '';
        
        // Track blocked requests
        if (errorText.includes('ERR_BLOCKED_BY_CLIENT')) {
          blockedRequestsCount++;
          hasBlockedRequests = true;
          // Only log first few to avoid spam
          if (blockedRequestsCount <= 3) {
            console.warn(`Request blocked (likely ad/tracker, non-fatal): ${request.url()}`);
          }
        } else {
          console.warn(`Request failed: ${request.url()}, Error: ${errorText}`);
        }
      });

      // Navigate to the URL with optimized timeouts for batch processing
      // Reduced timeouts to ensure we stay within Vercel's 300s limit when processing batches
      // Use 'domcontentloaded' first for faster loading, then wait for resources
      try {
        // Try domcontentloaded first (fastest, doesn't wait for all resources)
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 30000, // 30 seconds
        });
        
        // Wait for page to stabilize - some resources may be blocked but main content loads
        // This handles ERR_BLOCKED_BY_CLIENT gracefully
        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds for resources
        
        // Try to wait for network to be idle, but don't fail if it times out
        // Note: Some requests may be blocked (ERR_BLOCKED_BY_CLIENT) but main content should load
        try {
          await page.waitForFunction(
            () => document.readyState === 'complete',
            { timeout: 5000 }
          ).catch(() => {
            // Ignore timeout - page might be ready anyway
          });
        } catch {
          // Ignore - page is likely loaded enough
        }
      } catch (navigationError) {
        // If navigation fails completely, try with 'load'
        try {
          await page.goto(url, {
            waitUntil: 'load',
            timeout: 45000, // 45 seconds for load
          });
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (loadError) {
          // Last resort: just try to get the page content
          // Even if some resources fail, we might still get the main content
          console.warn(`Navigation had issues for ${url}, attempting PDF generation anyway`);
        }
      }

      // Check if page is still valid (not destroyed)
      if (page.isClosed()) {
        throw new Error('Page was closed during navigation');
      }

      const pageUrlAfterLoad = page.url();
      const pageContent = await page.content();
      const blockerReason = detectAccessBlocker(pageContent, pageUrlAfterLoad);
      if (blockerReason) {
        throw new Error(`[CAPTCHA_BLOCKED] ${blockerReason}`);
      }

      // Generate PDF with error handling
      // Even if some requests were blocked (ERR_BLOCKED_BY_CLIENT), main content should be available
      let pdfBuffer: Buffer;
      try {
        const pdfData = await page.pdf({
          format: 'A4',
          printBackground: true,
        });
        pdfBuffer = Buffer.from(pdfData);
        
        // Log if we had blocked requests but still succeeded
        if (hasBlockedRequests) {
          console.log(`PDF generated successfully despite ${blockedRequestsCount} blocked requests (likely ads/trackers)`);
        }
      } catch (pdfError) {
        // If PDF generation fails due to context destruction, retry
        if (pdfError instanceof Error && 
            (pdfError.message.includes('Execution context') || 
             pdfError.message.includes('Target closed'))) {
          throw new Error('Execution context was destroyed during PDF generation');
        }
        
        // If we had blocked requests, provide more helpful error message
        if (hasBlockedRequests && pdfError instanceof Error) {
          throw new Error(`PDF generation failed. Some page resources were blocked (${blockedRequestsCount} requests). This may indicate the page requires JavaScript or has strict blocking. Original error: ${pdfError.message}`);
        }
        
        throw pdfError;
      }

      await browser.close();
      return pdfBuffer;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Clean up browser on error
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          // Ignore close errors
        }
      }

      // Check if error is retryable
      const errorMessage = lastError.message.toLowerCase();
      const isRetryable = 
        errorMessage.includes('execution context') ||
        errorMessage.includes('target closed') ||
        errorMessage.includes('navigation') ||
        errorMessage.includes('err_http2') ||
        errorMessage.includes('protocol error') ||
        (errorMessage.includes('net::') && !errorMessage.includes('err_blocked_by_client'));
      
      // ERR_BLOCKED_BY_CLIENT is often non-fatal - page content may still be available
      // Try to generate PDF anyway if this is the only error
      const isBlockedByClient = errorMessage.includes('err_blocked_by_client');
      if (isBlockedByClient && attempt === 0) {
        console.log(`ERR_BLOCKED_BY_CLIENT detected for ${url}, attempting PDF generation anyway`);
        // Try to generate PDF even with blocked requests - main content might be available
        try {
          if (page && !page.isClosed()) {
            const pdfData = await page.pdf({
              format: 'A4',
              printBackground: true,
            });
            const pdfBuffer = Buffer.from(pdfData);
            await browser.close();
            return pdfBuffer;
          }
        } catch (pdfError) {
          // If PDF generation fails, continue to retry logic
          console.warn('PDF generation failed even with ERR_BLOCKED_BY_CLIENT:', pdfError);
        }
      }

      if (isRetryable && attempt < maxRetries) {
        console.log(`Retry ${attempt + 1}/${maxRetries} for ${url} due to: ${lastError.message}`);
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }

      // If not retryable or max retries reached, throw error
      throw lastError;
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError || new Error('Failed to render PDF after retries');
}

/**
 * Sanitizes a filename by removing invalid characters
 */
export function sanitizeFilename(title: string, id: number): string {
  // Replace invalid characters with underscore
  let filename = title.replace(/[/\\:*?"<>|]/g, '_');
  
  // Remove leading/trailing dots and spaces
  filename = filename.replace(/^[.\s]+|[.\s]+$/g, '');
  
  // Truncate if too long (max 80 chars for filename)
  if (filename.length > 80) {
    filename = filename.substring(0, 80);
  }
  
  // Ensure it's not empty
  if (!filename || filename.trim().length === 0) {
    filename = `Reference_${id}`;
  }
  
  return filename;
}

