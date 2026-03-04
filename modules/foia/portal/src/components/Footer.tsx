/**
 * Footer Component
 */

import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="container mx-auto px-4 py-8">
        <div className="grid md:grid-cols-3 gap-8">
          {/* About */}
          <div>
            <h3 className="text-white font-semibold mb-4">About FOIA</h3>
            <p className="text-sm">
              The Freedom of Information Act (FOIA) gives you the right to access 
              information from the federal government. Use this portal to submit 
              and track your requests.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-white font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/submit-request" className="hover:text-white transition-colors">
                  Submit Request
                </Link>
              </li>
              <li>
                <Link href="/status" className="hover:text-white transition-colors">
                  Check Status
                </Link>
              </li>
              <li>
                <Link href="/agencies" className="hover:text-white transition-colors">
                  Agency Directory
                </Link>
              </li>
              <li>
                <Link href="/faq" className="hover:text-white transition-colors">
                  FOIA Guide
                </Link>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h3 className="text-white font-semibold mb-4">Resources</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a 
                  href="https://www.foia.gov" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="hover:text-white transition-colors"
                >
                  FOIA.gov
                </a>
              </li>
              <li>
                <a 
                  href="https://www.justice.gov/oip" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="hover:text-white transition-colors"
                >
                  DOJ FOIA Resources
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm">
          <p>&copy; {new Date().getFullYear()} FOIA Portal. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
