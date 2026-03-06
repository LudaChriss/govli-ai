/**
 * Root Layout
 * Provides global layout structure with navigation and error boundaries
 */

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ErrorBoundary from '@/components/ErrorBoundary';
import PWARegistration from '@/components/PWARegistration';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'FOIA Portal - Request Public Records',
  description: 'Submit and track Freedom of Information Act (FOIA) requests online',
  keywords: ['FOIA', 'Freedom of Information', 'Public Records', 'Government Transparency'],
  manifest: '/manifest.json',
  themeColor: '#0D7C8C',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'FOIA Portal',
  },
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <a href="#main-content" className="skip-to-main">
          Skip to main content
        </a>

        <div className="min-h-screen flex flex-col">
          <Header />

          <ErrorBoundary>
            <main id="main-content" className="flex-1">
              {children}
            </main>
          </ErrorBoundary>

          <Footer />
        </div>

        <PWARegistration />
      </body>
    </html>
  );
}
