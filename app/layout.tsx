import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://wiki-reference-downloader.vercel.app';
const ogImageUrl = `${baseUrl}/wiki-reference-downloader.png`;

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
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
    url: baseUrl,
    siteName: "Wiki Reference Downloader",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: ogImageUrl,
        width: 1536,
        height: 1024,
        type: "image/png",
        alt: "Wikipedia Reference Downloader - Extract and download all Wikipedia article references as PDFs",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Wiki Reference Downloader – Export All Citations as PDF in One Click",
    description: "Paste a Wikipedia link → Get all references as PDFs. Done.",
    images: [ogImageUrl],
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
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  const html = document.documentElement;
                  if (prefersDark) {
                    html.classList.add('dark');
                  } else {
                    html.classList.remove('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
        <Script
          id="ms-clarity"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function(c,l,a,r,i,t,y){
                c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
              })(window, document, "clarity", "script", "u7op9cbkdm");
            `,
          }}
        />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
