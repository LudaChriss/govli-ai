/**
 * Home Page
 * Landing page with links to main features
 */

import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="bg-gradient-to-b from-navy-50 to-white">
      {/* Hero Section */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-brand-navy mb-6">
            Request Public Records
          </h1>
          <p className="text-xl text-gray-700 mb-8">
            Use the Freedom of Information Act (FOIA) to access government records.
            Submit your request online and track its progress.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/submit-request" className="btn btn-primary text-lg px-8 py-3">
              Submit a Request
            </Link>
            <Link href="/status" className="btn btn-outline text-lg px-8 py-3">
              Check Request Status
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <div className="card p-6">
            <div className="w-12 h-12 bg-brand-teal rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-brand-navy mb-2">
              Submit Requests
            </h3>
            <p className="text-gray-600">
              Fill out a simple form to request government records. We'll guide you through the process.
            </p>
          </div>

          <div className="card p-6">
            <div className="w-12 h-12 bg-brand-teal rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-brand-navy mb-2">
              Track Progress
            </h3>
            <p className="text-gray-600">
              Monitor your request status in real-time. Get notified when your documents are ready.
            </p>
          </div>

          <div className="card p-6">
            <div className="w-12 h-12 bg-brand-teal rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-brand-navy mb-2">
              Download Records
            </h3>
            <p className="text-gray-600">
              Access and download your requested documents securely from your account.
            </p>
          </div>
        </div>
      </section>

      {/* Quick Links Section */}
      <section className="bg-navy-50 py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-brand-navy mb-8 text-center">
              Quick Links
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <Link href="/my-requests" className="card p-4 hover:shadow-md transition-shadow">
                <h3 className="font-semibold text-brand-navy mb-1">My Requests</h3>
                <p className="text-sm text-gray-600">View all your submitted requests</p>
              </Link>
              <Link href="/appeal" className="card p-4 hover:shadow-md transition-shadow">
                <h3 className="font-semibold text-brand-navy mb-1">File an Appeal</h3>
                <p className="text-sm text-gray-600">Appeal a denied request</p>
              </Link>
              <Link href="/agencies" className="card p-4 hover:shadow-md transition-shadow">
                <h3 className="font-semibold text-brand-navy mb-1">Agency Directory</h3>
                <p className="text-sm text-gray-600">Find agency contact information</p>
              </Link>
              <Link href="/faq" className="card p-4 hover:shadow-md transition-shadow">
                <h3 className="font-semibold text-brand-navy mb-1">FOIA Guide</h3>
                <p className="text-sm text-gray-600">Learn how FOIA works</p>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
