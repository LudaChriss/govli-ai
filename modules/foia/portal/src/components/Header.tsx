/**
 * Header Component
 * Main navigation with mobile-responsive menu
 */

'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="bg-brand-navy text-white shadow-lg">
      <nav className="container mx-auto px-4" aria-label="Main navigation">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="text-xl font-bold hover:text-brand-gold transition-colors">
            FOIA Portal
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-6">
            <Link 
              href="/submit-request" 
              className="hover:text-brand-gold transition-colors"
            >
              Submit Request
            </Link>
            <Link 
              href="/status" 
              className="hover:text-brand-gold transition-colors"
            >
              Check Status
            </Link>
            <Link 
              href="/my-requests" 
              className="hover:text-brand-gold transition-colors"
            >
              My Requests
            </Link>
            <Link 
              href="/agencies" 
              className="hover:text-brand-gold transition-colors"
            >
              Agencies
            </Link>
            <Link 
              href="/faq" 
              className="hover:text-brand-gold transition-colors"
            >
              FAQ
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            type="button"
            className="md:hidden p-2 rounded-md hover:bg-navy-700 transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div id="mobile-menu" className="md:hidden py-4 border-t border-navy-700">
            <div className="flex flex-col space-y-3">
              <Link 
                href="/submit-request" 
                className="py-2 hover:text-brand-gold transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Submit Request
              </Link>
              <Link 
                href="/status" 
                className="py-2 hover:text-brand-gold transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Check Status
              </Link>
              <Link 
                href="/my-requests" 
                className="py-2 hover:text-brand-gold transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                My Requests
              </Link>
              <Link 
                href="/agencies" 
                className="py-2 hover:text-brand-gold transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Agencies
              </Link>
              <Link 
                href="/faq" 
                className="py-2 hover:text-brand-gold transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                FAQ
              </Link>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
