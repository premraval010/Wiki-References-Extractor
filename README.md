# Wikipedia Reference Downloader

Instantly turn any Wikipedia article's references into a neatly packaged ZIP of PDFs.

## Features

- 🔍 **Extract References**: Automatically extracts all external references from any Wikipedia article
- 📄 **PDF Conversion**: Converts HTML pages to PDFs using Puppeteer, or downloads direct PDF files
- 📦 **ZIP Archive**: Bundles all downloaded PDFs into a single ZIP file
- 📊 **CSV Export**: Export reference data as CSV for analysis
- 🎨 **Modern UI**: Clean, responsive interface with dark mode support
- ⚡ **Real-time Progress**: Live progress tracking with estimated time remaining
- 🔄 **Error Handling**: Detailed error messages for failed downloads

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **PDF Generation**: Puppeteer
- **HTML Parsing**: Cheerio
- **ZIP Creation**: Archiver

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/premraval010/Wiki-References-Extractor.git
cd Wiki-References-Extractor/wiki-ref-downloader
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

1. Paste a Wikipedia article URL (e.g., `https://en.wikipedia.org/wiki/...`)
2. Click "Fetch & Download References"
3. Watch the real-time progress as references are processed
4. Download the ZIP file containing all PDFs
5. Optionally export the reference list as CSV

## Deployment

### Deploy on Vercel

The easiest way to deploy is using [Vercel](https://vercel.com):

1. Push your code to GitHub
2. Import your repository on [Vercel](https://vercel.com/new)
3. Vercel will automatically detect Next.js and configure the build
4. Deploy!

**Note**: Puppeteer requires additional configuration on Vercel. You may need to:
- Use `@sparticuz/chromium` for serverless environments
- Or configure Puppeteer to use a bundled Chromium

### Environment Variables

No environment variables are required for basic functionality.

## Project Structure

```
wiki-ref-downloader/
├── app/
│   ├── api/
│   │   ├── extract-references/    # Extract references from article
│   │   ├── process-reference/     # Process individual reference
│   │   ├── process-article/       # Legacy endpoint
│   │   └── create-zip/             # Create ZIP archive
│   ├── page.tsx                   # Main UI
│   ├── layout.tsx                 # Root layout
│   └── globals.css                # Global styles
├── lib/
│   ├── wiki.ts                    # Wikipedia utilities
│   ├── pdf.ts                     # PDF generation/download
│   └── zip.ts                     # ZIP creation
└── package.json
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
