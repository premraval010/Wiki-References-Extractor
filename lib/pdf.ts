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
        ...(isVercel && chromium ? chromium.args : []),
      ],
    };

    // Use Chromium binary for Vercel, system Chrome for local
    if (isVercel && chromium) {
      launchOptions.executablePath = await chromium.executablePath();
    }

    browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();
    
    // Set viewport for consistent rendering
    await page.setViewport({ width: 1200, height: 800 });
    
    // Navigate to the URL with increased timeout for slow-loading pages
    // Try networkidle2 first, but fall back to load if it takes too long
    try {
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 90000, // 90 seconds for networkidle2
      });
    } catch (timeoutError) {
      // If networkidle2 times out, try with 'load' which is less strict
      await page.goto(url, {
        waitUntil: 'load',
        timeout: 60000, // 60 seconds for load
      });
      // Wait a bit more for any late-loading resources
      await page.waitForTimeout(2000);
    }

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
    });

    return Buffer.from(pdfBuffer);
  } catch (error) {
    throw new Error(`Failed to render PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
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

