import puppeteer from 'puppeteer';

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
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download PDF: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Renders a URL to PDF using Puppeteer
 */
export async function renderUrlToPdf(url: string): Promise<Buffer> {
  let browser;
  try {
    // Launch browser with appropriate settings for Next.js
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage();
    
    // Set viewport for consistent rendering
    await page.setViewport({ width: 1200, height: 800 });
    
    // Navigate to the URL with timeout
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

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

