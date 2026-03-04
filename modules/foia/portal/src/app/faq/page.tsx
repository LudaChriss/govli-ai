'use client';

/**
 * FAQ Page - FOIA Guide
 * Plain language guide to FOIA in an accessible accordion format
 * Written at a grade 7 reading level
 */

import { useState } from 'react';
import Link from 'next/link';

interface FAQItem {
  id: string;
  question: string;
  answer: string | JSX.Element;
}

const FAQ_SECTIONS: { title: string; items: FAQItem[] }[] = [
  {
    title: 'What is FOIA?',
    items: [
      {
        id: 'what-is-foia',
        question: 'What is the Freedom of Information Act?',
        answer: (
          <>
            <p className="mb-3">
              The Freedom of Information Act (FOIA) is a law that gives you the right to request
              records from government agencies. This includes documents, emails, reports, and other
              information the government has.
            </p>
            <p>
              FOIA helps make the government more open and accountable to the public.
            </p>
          </>
        ),
      },
      {
        id: 'who-can-use',
        question: 'Who can use FOIA?',
        answer: (
          <>
            <p className="mb-3">Anyone can use FOIA. You do not need to be a U.S. citizen.</p>
            <p>
              Individuals, businesses, news organizations, researchers, and advocacy groups all
              use FOIA to get government information.
            </p>
          </>
        ),
      },
      {
        id: 'what-records',
        question: 'What records can I request?',
        answer: (
          <>
            <p className="mb-3">You can request almost any record created or kept by a government agency, including:</p>
            <ul className="list-disc list-inside space-y-1 mb-3">
              <li>Emails and letters</li>
              <li>Reports and studies</li>
              <li>Meeting minutes and notes</li>
              <li>Photos and videos</li>
              <li>Data and statistics</li>
            </ul>
            <p>
              However, some information is protected and cannot be released, such as national
              security information or personal privacy details.
            </p>
          </>
        ),
      },
    ],
  },
  {
    title: 'How to Submit a Request',
    items: [
      {
        id: 'how-to-submit',
        question: 'How do I submit a FOIA request?',
        answer: (
          <>
            <p className="mb-3">You can submit a FOIA request using our online form:</p>
            <ol className="list-decimal list-inside space-y-2 mb-3">
              <li>Click the "Submit Request" button</li>
              <li>Fill out your contact information</li>
              <li>Describe the records you want</li>
              <li>Submit the form</li>
            </ol>
            <p className="mb-3">
              You will receive a confirmation number to track your request.
            </p>
            <Link href="/submit-request" className="btn btn-primary">
              Submit a Request
            </Link>
          </>
        ),
      },
      {
        id: 'be-specific',
        question: 'How specific should my request be?',
        answer: (
          <>
            <p className="mb-3">
              Be as specific as possible. The more details you provide, the easier it is for us
              to find the records you want.
            </p>
            <p className="mb-3">Include information like:</p>
            <ul className="list-disc list-inside space-y-1 mb-3">
              <li>Date ranges (e.g., "January 2023 to March 2023")</li>
              <li>Names of people, programs, or projects</li>
              <li>Types of documents (e.g., "meeting minutes," "email correspondence")</li>
              <li>Specific topics or keywords</li>
            </ul>
            <p>
              If your request is too broad, we may ask you to narrow it down.
            </p>
          </>
        ),
      },
      {
        id: 'what-happens',
        question: 'What happens after I submit my request?',
        answer: (
          <>
            <ol className="list-decimal list-inside space-y-2">
              <li>
                <strong>You get a confirmation:</strong> We send you an email with a tracking number
              </li>
              <li>
                <strong>We review your request:</strong> We make sure we understand what you want
              </li>
              <li>
                <strong>We search for records:</strong> We look for documents that match your request
              </li>
              <li>
                <strong>We review what we found:</strong> We check if any information needs to be
                protected
              </li>
              <li>
                <strong>We send you the records:</strong> You can download them from this website
              </li>
            </ol>
          </>
        ),
      },
    ],
  },
  {
    title: 'Processing Times',
    items: [
      {
        id: 'how-long',
        question: 'How long does it take?',
        answer: (
          <>
            <p className="mb-3">
              By law, agencies have 20 business days to respond to your request. However, the actual
              time can vary based on:
            </p>
            <ul className="list-disc list-inside space-y-1 mb-3">
              <li>How complex your request is</li>
              <li>How many records need to be reviewed</li>
              <li>How many other requests we are processing</li>
            </ul>
            <p>
              Most requests are completed within 20-30 business days. Complex requests may take longer.
            </p>
          </>
        ),
      },
      {
        id: 'expedited',
        question: 'Can I get my request expedited?',
        answer: (
          <>
            <p className="mb-3">
              Yes, in certain situations you can request expedited processing. This means we will
              handle your request faster.
            </p>
            <p className="mb-3">You may qualify for expedited processing if:</p>
            <ul className="list-disc list-inside space-y-1 mb-3">
              <li>There is an urgent need for the information</li>
              <li>The information relates to a matter of public safety</li>
              <li>You are a news organization reporting on a time-sensitive topic</li>
            </ul>
            <p>
              You must explain why you need expedited processing when you submit your request.
            </p>
          </>
        ),
      },
      {
        id: 'track-status',
        question: 'How can I check the status of my request?',
        answer: (
          <>
            <p className="mb-3">
              You can track your request using the confirmation number we sent you:
            </p>
            <ol className="list-decimal list-inside space-y-2 mb-3">
              <li>Go to the "Check Status" page</li>
              <li>Enter your confirmation number</li>
              <li>View the current status and estimated completion date</li>
            </ol>
            <Link href="/status" className="btn btn-primary">
              Check Request Status
            </Link>
          </>
        ),
      },
    ],
  },
  {
    title: 'Fees',
    items: [
      {
        id: 'fees-cost',
        question: 'Will I have to pay fees?',
        answer: (
          <>
            <p className="mb-3">
              It depends. Fees may apply for searching for records, reviewing them, and making copies.
              However, many requests have no fees or very low fees.
            </p>
            <p className="mb-3">Fees depend on:</p>
            <ul className="list-disc list-inside space-y-1 mb-3">
              <li>Who you are (news media, researchers, and public interest groups may get lower fees)</li>
              <li>How much work is needed to process your request</li>
              <li>How many pages of documents you receive</li>
            </ul>
            <p>
              We will tell you if fees will apply before we start processing your request.
            </p>
          </>
        ),
      },
      {
        id: 'fee-waiver',
        question: 'Can I get fees waived?',
        answer: (
          <>
            <p className="mb-3">
              Yes, you can request a fee waiver when you submit your FOIA request.
            </p>
            <p className="mb-3">
              Fees may be waived if releasing the information:
            </p>
            <ul className="list-disc list-inside space-y-1 mb-3">
              <li>Benefits the public (not just you personally)</li>
              <li>Helps people understand government operations</li>
              <li>Will be shared with the public</li>
            </ul>
            <p>
              You must explain why you believe fees should be waived in your request.
            </p>
          </>
        ),
      },
    ],
  },
  {
    title: 'Appeals',
    items: [
      {
        id: 'what-if-denied',
        question: 'What if my request is denied?',
        answer: (
          <>
            <p className="mb-3">
              If your request is denied (in full or in part), you have the right to appeal.
              An appeal asks a higher authority to review the decision.
            </p>
            <p className="mb-3">
              You should appeal if you believe:
            </p>
            <ul className="list-disc list-inside space-y-1 mb-3">
              <li>The exemptions were applied incorrectly</li>
              <li>The search for records was inadequate</li>
              <li>The fees are unreasonable</li>
            </ul>
            <p>
              You must file your appeal within 30 days of receiving the denial.
            </p>
          </>
        ),
      },
      {
        id: 'how-to-appeal',
        question: 'How do I file an appeal?',
        answer: (
          <>
            <p className="mb-3">To file an appeal:</p>
            <ol className="list-decimal list-inside space-y-2 mb-3">
              <li>Go to the Appeals page</li>
              <li>Enter your request confirmation number</li>
              <li>Explain why you believe the decision should be changed</li>
              <li>Submit your appeal</li>
            </ol>
            <p className="mb-3">
              Be specific about what you disagree with and why.
            </p>
            <Link href="/appeal" className="btn btn-primary">
              File an Appeal
            </Link>
          </>
        ),
      },
      {
        id: 'appeal-timeline',
        question: 'How long does an appeal take?',
        answer: (
          <>
            <p className="mb-3">
              Appeals are usually decided within 20 business days, though complex appeals may take longer.
            </p>
            <p>
              The appeal decision is final. If your appeal is denied, you may be able to take
              legal action in federal court.
            </p>
          </>
        ),
      },
    ],
  },
  {
    title: 'Common Questions',
    items: [
      {
        id: 'what-are-exemptions',
        question: 'What are FOIA exemptions?',
        answer: (
          <>
            <p className="mb-3">
              FOIA exemptions are reasons why certain information cannot be released. There are
              9 exemptions that protect things like:
            </p>
            <ul className="list-disc list-inside space-y-1 mb-3">
              <li>National security information</li>
              <li>Personal privacy</li>
              <li>Law enforcement investigations</li>
              <li>Trade secrets and business information</li>
              <li>Internal government communications</li>
            </ul>
            <p>
              Even if some information is exempt, you may still receive other parts of the records.
            </p>
          </>
        ),
      },
      {
        id: 'redactions',
        question: 'Why are parts of documents blacked out?',
        answer: (
          <>
            <p className="mb-3">
              When we black out (redact) parts of documents, it means that information is protected
              by a FOIA exemption. We can release the rest of the document, but not the protected parts.
            </p>
            <p>
              Each redaction will include a code showing which exemption applies (like "b(6)" for
              personal privacy).
            </p>
          </>
        ),
      },
      {
        id: 'get-help',
        question: 'Where can I get help?',
        answer: (
          <>
            <p className="mb-3">
              If you need help with your FOIA request, contact us:
            </p>
            <div className="space-y-2 mb-3">
              <p>
                <strong>Email:</strong>{' '}
                <a href="mailto:foia@agency.gov" className="text-brand-teal hover:underline">
                  foia@agency.gov
                </a>
              </p>
              <p>
                <strong>Phone:</strong>{' '}
                <a href="tel:1-800-555-0100" className="text-brand-teal hover:underline">
                  1-800-555-0100
                </a>
              </p>
            </div>
            <p>
              Our FOIA staff are available Monday-Friday, 9am-5pm EST.
            </p>
          </>
        ),
      },
    ],
  },
];

function FAQAccordion({ section }: { section: typeof FAQ_SECTIONS[0] }) {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());

  const toggleItem = (id: string) => {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="space-y-2">
      {section.items.map((item) => {
        const isOpen = openItems.has(item.id);

        return (
          <div key={item.id} className="card">
            <button
              onClick={() => toggleItem(item.id)}
              className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
              aria-expanded={isOpen}
              aria-controls={`faq-${item.id}`}
            >
              <h3 className="font-semibold text-brand-navy pr-4">{item.question}</h3>
              <svg
                className={`w-5 h-5 text-gray-500 flex-shrink-0 transition-transform ${
                  isOpen ? 'transform rotate-180' : ''
                }`}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path d="M19 9l-7 7-7-7"></path>
              </svg>
            </button>

            {isOpen && (
              <div
                id={`faq-${item.id}`}
                className="px-6 pb-4 text-gray-700"
                role="region"
              >
                {typeof item.answer === 'string' ? (
                  <p>{item.answer}</p>
                ) : (
                  item.answer
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function FAQPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-brand-navy mb-2">
            FOIA Guide
          </h1>
          <p className="text-gray-600">
            Learn about the Freedom of Information Act and how to request public records
          </p>
        </div>

        {/* Quick Links */}
        <div className="card p-6 mb-8 bg-blue-50 border-blue-200">
          <h2 className="font-semibold mb-3">Quick Links</h2>
          <div className="flex flex-wrap gap-3">
            <Link href="/submit-request" className="btn btn-primary">
              Submit a Request
            </Link>
            <Link href="/status" className="btn btn-outline">
              Check Status
            </Link>
            <Link href="/agencies" className="btn btn-outline">
              Agency Directory
            </Link>
          </div>
        </div>

        {/* FAQ Sections */}
        <div className="space-y-8">
          {FAQ_SECTIONS.map((section) => (
            <div key={section.title}>
              <h2 className="text-2xl font-bold text-brand-navy mb-4">
                {section.title}
              </h2>
              <FAQAccordion section={section} />
            </div>
          ))}
        </div>

        {/* Additional Resources */}
        <div className="mt-8 card p-6">
          <h2 className="text-xl font-semibold mb-3">Additional Resources</h2>
          <ul className="space-y-2 text-sm">
            <li>
              <a
                href="https://www.foia.gov"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-teal hover:underline"
              >
                FOIA.gov - Official FOIA website
              </a>
            </li>
            <li>
              <a
                href="https://www.justice.gov/oip/foia-guide"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-teal hover:underline"
              >
                Department of Justice FOIA Guide
              </a>
            </li>
          </ul>
        </div>

        {/* Contact */}
        <div className="mt-6 card p-6 bg-brand-navy text-white">
          <h2 className="text-xl font-semibold mb-3">Still Have Questions?</h2>
          <p className="mb-4">
            Our FOIA team is here to help. Contact us if you need assistance with your request.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <a href="mailto:foia@agency.gov" className="btn bg-white text-brand-navy hover:bg-gray-100">
              Email Us
            </a>
            <a href="tel:1-800-555-0100" className="btn bg-white text-brand-navy hover:bg-gray-100">
              Call Us
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
