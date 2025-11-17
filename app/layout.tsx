import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Download All Wikipedia References as PDFs – Free Wiki Reference Downloader",
  description: "Convert any Wikipedia article's references into downloadable PDFs instantly. Paste a Wikipedia link and get all citations bundled into a clean ZIP file. Fast, simple, accurate, and built for researchers, students, and knowledge workers.",
  keywords: [
    "Wikipedia reference downloader",
    "Download Wikipedia citations",
    "Wikipedia references to PDF",
    "Wiki citation extractor",
    "Research tool for Wikipedia",
    "Export Wiki references",
    "Wikipedia PDF downloader",
    "Bulk cite downloader",
    "Academic citation tools",
  ],
  authors: [{ name: "Wikipedia Reference Downloader" }],
  creator: "Wikipedia Reference Downloader",
  publisher: "Wikipedia Reference Downloader",
  openGraph: {
    title: "Wiki Reference Downloader – Export All Citations as PDF in One Click",
    description: "Turn any Wikipedia page into a ready-to-download ZIP of all its reference sources in PDF format. Perfect for research, reporting, citations, and academic work.",
    url: "https://wiki-reference-downloader.vercel.app",
    siteName: "Wiki Reference Downloader",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/wiki-reference-downloader.png",
        width: 1536,
        height: 1024,
        alt: "Wikipedia Reference Downloader - Extract and download all Wikipedia article references as PDFs",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Wiki Reference Downloader – Export All Citations as PDF in One Click",
    description: "Paste a Wikipedia link → Get all references as PDFs. Done.",
    images: ["/wiki-reference-downloader.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "https://wiki-reference-downloader.vercel.app",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Script
          id="dark-mode-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const stored = localStorage.getItem('darkMode');
                  const html = document.documentElement;
                  if (stored === null) {
                    // Use system preference
                    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                    if (prefersDark) {
                      html.classList.add('dark');
                      html.setAttribute('data-theme', 'dark');
                    } else {
                      html.classList.remove('dark');
                      html.setAttribute('data-theme', 'light');
                    }
                  } else {
                    // Use stored preference
                    const isDark = stored === 'true';
                    if (isDark) {
                      html.classList.add('dark');
                      html.setAttribute('data-theme', 'dark');
                    } else {
                      html.classList.remove('dark');
                      html.setAttribute('data-theme', 'light');
                    }
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
        {children}
      </body>
    </html>
  );
}
