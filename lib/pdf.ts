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
  const timeoutId = setTimeout(() => controller.abort(), 120000); // 120 seconds timeout

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
      
      // Intercept and allow all requests to prevent blocking
      await page.setRequestInterception(true);
      page.on('request', (request: any) => {
        // Allow all requests, don't block anything
        request.continue();
      });
      
      // Handle page errors and navigation issues
      page.on('error', (err: Error) => {
        console.warn('Page error (non-fatal):', err.message);
      });
      
      // Handle request failures
      page.on('requestfailed', (request: any) => {
        // Log but don't fail - some requests may fail but page might still load
        console.warn('Request failed:', request.url(), request.failure()?.errorText);
      });

      // Navigate to the URL with increased timeout for slow-loading pages
      // Try networkidle2 first, but fall back to load if it takes too long
      try {
        await page.goto(url, {
          waitUntil: 'networkidle2',
          timeout: 90000, // 90 seconds for networkidle2
        });
      } catch (timeoutError) {
        // If networkidle2 times out, try with 'load' which is less strict
        try {
          await page.goto(url, {
            waitUntil: 'load',
            timeout: 60000, // 60 seconds for load
          });
          // Wait a bit more for any late-loading resources
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (loadError) {
          // If load also fails, try with 'domcontentloaded' (fastest)
          await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 30000, // 30 seconds for domcontentloaded
          });
          await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for resources
        }
      }

      // Check if page is still valid (not destroyed)
      if (page.isClosed()) {
        throw new Error('Page was closed during navigation');
      }

      // Generate PDF with error handling
      let pdfBuffer: Buffer;
      try {
        const pdfData = await page.pdf({
          format: 'A4',
          printBackground: true,
        });
        pdfBuffer = Buffer.from(pdfData);
      } catch (pdfError) {
        // If PDF generation fails due to context destruction, retry
        if (pdfError instanceof Error && 
            (pdfError.message.includes('Execution context') || 
             pdfError.message.includes('Target closed'))) {
          throw new Error('Execution context was destroyed during PDF generation');
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
        errorMessage.includes('net::');

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

