'use client';

/**
 * FOIA Request Submission Form - 4-Step Wizard
 * Mobile-responsive, WCAG-compliant form with auto-save functionality
 */

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { submitRequest } from '@/lib/api';
import { saveDraft, loadDraft, clearDraft } from '@/lib/storage';
import { isValidEmail, isValidPhone } from '@/lib/utils';
import type { RequestFormData } from '@/types';

const INITIAL_FORM_DATA: RequestFormData = {
  requester_name: '',
  requester_email: '',
  requester_phone: '',
  requester_address: '',
  requester_organization: '',
  subject: '',
  description: '',
  date_range_start: '',
  date_range_end: '',
  category: '',
  urgency: 'STANDARD',
  expedited_justification: '',
  fee_waiver_requested: false,
  fee_waiver_justification: '',
  step: 1,
};

export default function SubmitRequestPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<RequestFormData>(INITIAL_FORM_DATA);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDraftNotice, setShowDraftNotice] = useState(false);

  // Load draft on mount
  useEffect(() => {
    const draft = loadDraft<RequestFormData>('request_form');
    if (draft && draft.step) {
      setFormData(draft);
      setCurrentStep(draft.step);
      setShowDraftNotice(true);
      setTimeout(() => setShowDraftNotice(false), 5000);
    }
  }, []);

  // Auto-save to localStorage
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (formData.requester_name || formData.requester_email || formData.subject) {
        saveDraft('request_form', { ...formData, step: currentStep });
      }
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [formData, currentStep]);

  const updateField = (field: keyof RequestFormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};

    if (step === 1) {
      if (!formData.requester_name.trim()) {
        newErrors.requester_name = 'Name is required';
      }
      if (!formData.requester_email.trim()) {
        newErrors.requester_email = 'Email is required';
      } else if (!isValidEmail(formData.requester_email)) {
        newErrors.requester_email = 'Please enter a valid email address';
      }
      if (formData.requester_phone && !isValidPhone(formData.requester_phone)) {
        newErrors.requester_phone = 'Please enter a valid phone number';
      }
    }

    if (step === 2) {
      if (!formData.subject.trim()) {
        newErrors.subject = 'Subject is required';
      }
      if (!formData.description.trim()) {
        newErrors.description = 'Description is required';
      } else if (formData.description.length < 20) {
        newErrors.description = 'Please provide at least 20 characters describing the records you seek';
      }
    }

    if (step === 3) {
      if (formData.urgency === 'EXPEDITED' && !formData.expedited_justification?.trim()) {
        newErrors.expedited_justification = 'Please explain why expedited processing is needed';
      }
      if (formData.fee_waiver_requested && !formData.fee_waiver_justification?.trim()) {
        newErrors.fee_waiver_justification = 'Please explain why a fee waiver should be granted';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, 4));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePrevious = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async () => {
    if (!validateStep(3)) return;

    setIsSubmitting(true);

    try {
      const { step, date_range_start, date_range_end, ...submitData } = formData;

      const result = await submitRequest(submitData);

      if (result.success && result.data) {
        clearDraft('request_form');
        router.push(`/status?confirmation=${result.data.confirmation_number}`);
      } else {
        setErrors({ submit: result.error?.message || 'Failed to submit request. Please try again.' });
      }
    } catch (error) {
      setErrors({ submit: 'An unexpected error occurred. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-brand-navy mb-2">
            Submit a FOIA Request
          </h1>
          <p className="text-gray-600">
            Complete this form to request public records
          </p>
        </div>

        {/* Draft Notice */}
        {showDraftNotice && (
          <div className="alert alert-info mb-6" role="status">
            <p className="font-medium">Draft restored</p>
            <p className="text-sm">We found a saved draft and restored your progress.</p>
          </div>
        )}

        {/* Progress Indicator */}
        <div className="mb-8" role="progressbar" aria-valuenow={currentStep} aria-valuemin={1} aria-valuemax={4}>
          <div className="flex items-center justify-between mb-2">
            {[1, 2, 3, 4].map((step) => (
              <div
                key={step}
                className={`flex items-center ${step < 4 ? 'flex-1' : ''}`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                    step <= currentStep
                      ? 'bg-brand-teal text-white'
                      : 'bg-gray-300 text-gray-600'
                  }`}
                >
                  {step}
                </div>
                {step < 4 && (
                  <div
                    className={`flex-1 h-1 mx-2 ${
                      step < currentStep ? 'bg-brand-teal' : 'bg-gray-300'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-gray-600">
            <span>Contact</span>
            <span>Records</span>
            <span>Options</span>
            <span>Review</span>
          </div>
        </div>

        {/* Form Card */}
        <div className="card p-6 sm:p-8">
          {/* Step 1: Contact Information */}
          {currentStep === 1 && (
            <div>
              <h2 className="text-2xl font-bold text-brand-navy mb-6">
                Step 1: Contact Information
              </h2>

              <div className="space-y-4">
                <div>
                  <label htmlFor="requester_name" className="form-label">
                    Full Name <span className="text-red-600" aria-label="required">*</span>
                  </label>
                  <input
                    type="text"
                    id="requester_name"
                    className="form-input"
                    value={formData.requester_name}
                    onChange={(e) => updateField('requester_name', e.target.value)}
                    aria-required="true"
                    aria-invalid={!!errors.requester_name}
                    aria-describedby={errors.requester_name ? 'requester_name_error' : undefined}
                  />
                  {errors.requester_name && (
                    <p id="requester_name_error" className="form-error" role="alert">
                      {errors.requester_name}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="requester_email" className="form-label">
                    Email Address <span className="text-red-600" aria-label="required">*</span>
                  </label>
                  <input
                    type="email"
                    id="requester_email"
                    className="form-input"
                    value={formData.requester_email}
                    onChange={(e) => updateField('requester_email', e.target.value)}
                    aria-required="true"
                    aria-invalid={!!errors.requester_email}
                    aria-describedby={errors.requester_email ? 'requester_email_error' : undefined}
                  />
                  {errors.requester_email && (
                    <p id="requester_email_error" className="form-error" role="alert">
                      {errors.requester_email}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="requester_phone" className="form-label">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    id="requester_phone"
                    className="form-input"
                    placeholder="(555) 123-4567"
                    value={formData.requester_phone}
                    onChange={(e) => updateField('requester_phone', e.target.value)}
                    aria-invalid={!!errors.requester_phone}
                    aria-describedby={errors.requester_phone ? 'requester_phone_error' : undefined}
                  />
                  {errors.requester_phone && (
                    <p id="requester_phone_error" className="form-error" role="alert">
                      {errors.requester_phone}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="requester_address" className="form-label">
                    Mailing Address
                  </label>
                  <textarea
                    id="requester_address"
                    className="form-input"
                    rows={3}
                    value={formData.requester_address}
                    onChange={(e) => updateField('requester_address', e.target.value)}
                  />
                  <p className="form-help">Optional, but helpful for mailing documents</p>
                </div>

                <div>
                  <label htmlFor="requester_organization" className="form-label">
                    Organization
                  </label>
                  <input
                    type="text"
                    id="requester_organization"
                    className="form-input"
                    placeholder="e.g., News organization, research institution"
                    value={formData.requester_organization}
                    onChange={(e) => updateField('requester_organization', e.target.value)}
                  />
                  <p className="form-help">If representing an organization</p>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Records Sought */}
          {currentStep === 2 && (
            <div>
              <h2 className="text-2xl font-bold text-brand-navy mb-6">
                Step 2: Records You Are Seeking
              </h2>

              <div className="space-y-4">
                <div>
                  <label htmlFor="subject" className="form-label">
                    Subject <span className="text-red-600" aria-label="required">*</span>
                  </label>
                  <input
                    type="text"
                    id="subject"
                    className="form-input"
                    placeholder="Brief summary of what you're requesting"
                    value={formData.subject}
                    onChange={(e) => updateField('subject', e.target.value)}
                    aria-required="true"
                    aria-invalid={!!errors.subject}
                    aria-describedby={errors.subject ? 'subject_error' : undefined}
                  />
                  {errors.subject && (
                    <p id="subject_error" className="form-error" role="alert">
                      {errors.subject}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="description" className="form-label">
                    Detailed Description <span className="text-red-600" aria-label="required">*</span>
                  </label>
                  <textarea
                    id="description"
                    className="form-input"
                    rows={6}
                    placeholder="Be specific about the records you need. Include details like dates, names, document types, or topics that will help locate the records."
                    value={formData.description}
                    onChange={(e) => updateField('description', e.target.value)}
                    aria-required="true"
                    aria-invalid={!!errors.description}
                    aria-describedby={errors.description ? 'description_error description_help' : 'description_help'}
                  />
                  <p id="description_help" className="form-help">
                    The more specific you are, the easier it is to find the records
                  </p>
                  {errors.description && (
                    <p id="description_error" className="form-error" role="alert">
                      {errors.description}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="date_range_start" className="form-label">
                      Date Range Start
                    </label>
                    <input
                      type="date"
                      id="date_range_start"
                      className="form-input"
                      value={formData.date_range_start}
                      onChange={(e) => updateField('date_range_start', e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="date_range_end" className="form-label">
                      Date Range End
                    </label>
                    <input
                      type="date"
                      id="date_range_end"
                      className="form-input"
                      value={formData.date_range_end}
                      onChange={(e) => updateField('date_range_end', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Category & Fees */}
          {currentStep === 3 && (
            <div>
              <h2 className="text-2xl font-bold text-brand-navy mb-6">
                Step 3: Request Options
              </h2>

              <div className="space-y-6">
                <div>
                  <label htmlFor="category" className="form-label">
                    Request Category
                  </label>
                  <select
                    id="category"
                    className="form-input"
                    value={formData.category}
                    onChange={(e) => updateField('category', e.target.value)}
                  >
                    <option value="">Select a category</option>
                    <option value="COMMERCIAL">Commercial Use</option>
                    <option value="EDUCATIONAL">Educational Institution</option>
                    <option value="NEWS_MEDIA">News Media</option>
                    <option value="PERSONAL">Personal Use</option>
                    <option value="PUBLIC_INTEREST">Public Interest</option>
                    <option value="OTHER">Other</option>
                  </select>
                  <p className="form-help">
                    Your category may affect processing fees
                  </p>
                </div>

                <div>
                  <fieldset>
                    <legend className="form-label">Processing Speed</legend>
                    <div className="space-y-2">
                      <label className="flex items-start">
                        <input
                          type="radio"
                          name="urgency"
                          value="STANDARD"
                          checked={formData.urgency === 'STANDARD'}
                          onChange={(e) => updateField('urgency', 'STANDARD')}
                          className="mt-1 mr-2"
                        />
                        <div>
                          <div className="font-medium">Standard Processing</div>
                          <div className="text-sm text-gray-600">
                            Typical processing time: 20-30 business days
                          </div>
                        </div>
                      </label>
                      <label className="flex items-start">
                        <input
                          type="radio"
                          name="urgency"
                          value="EXPEDITED"
                          checked={formData.urgency === 'EXPEDITED'}
                          onChange={(e) => updateField('urgency', 'EXPEDITED')}
                          className="mt-1 mr-2"
                        />
                        <div>
                          <div className="font-medium">Expedited Processing</div>
                          <div className="text-sm text-gray-600">
                            For urgent public need or life-threatening situations
                          </div>
                        </div>
                      </label>
                    </div>
                  </fieldset>

                  {formData.urgency === 'EXPEDITED' && (
                    <div className="mt-4">
                      <label htmlFor="expedited_justification" className="form-label">
                        Expedited Processing Justification <span className="text-red-600" aria-label="required">*</span>
                      </label>
                      <textarea
                        id="expedited_justification"
                        className="form-input"
                        rows={4}
                        placeholder="Explain why expedited processing is needed"
                        value={formData.expedited_justification}
                        onChange={(e) => updateField('expedited_justification', e.target.value)}
                        aria-required="true"
                        aria-invalid={!!errors.expedited_justification}
                        aria-describedby={errors.expedited_justification ? 'expedited_error' : undefined}
                      />
                      {errors.expedited_justification && (
                        <p id="expedited_error" className="form-error" role="alert">
                          {errors.expedited_justification}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="flex items-start">
                    <input
                      type="checkbox"
                      checked={formData.fee_waiver_requested}
                      onChange={(e) => updateField('fee_waiver_requested', e.target.checked)}
                      className="mt-1 mr-2"
                    />
                    <div>
                      <div className="font-medium">Request Fee Waiver</div>
                      <div className="text-sm text-gray-600">
                        Check this if you believe fees should be waived
                      </div>
                    </div>
                  </label>

                  {formData.fee_waiver_requested && (
                    <div className="mt-4">
                      <label htmlFor="fee_waiver_justification" className="form-label">
                        Fee Waiver Justification <span className="text-red-600" aria-label="required">*</span>
                      </label>
                      <textarea
                        id="fee_waiver_justification"
                        className="form-input"
                        rows={4}
                        placeholder="Explain why a fee waiver should be granted (e.g., public interest, news reporting, educational purpose)"
                        value={formData.fee_waiver_justification}
                        onChange={(e) => updateField('fee_waiver_justification', e.target.value)}
                        aria-required="true"
                        aria-invalid={!!errors.fee_waiver_justification}
                        aria-describedby={errors.fee_waiver_justification ? 'fee_waiver_error' : undefined}
                      />
                      {errors.fee_waiver_justification && (
                        <p id="fee_waiver_error" className="form-error" role="alert">
                          {errors.fee_waiver_justification}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Review & Submit */}
          {currentStep === 4 && (
            <div>
              <h2 className="text-2xl font-bold text-brand-navy mb-6">
                Step 4: Review Your Request
              </h2>

              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold text-lg mb-2">Contact Information</h3>
                  <dl className="space-y-2 text-sm">
                    <div>
                      <dt className="text-gray-600">Name:</dt>
                      <dd className="font-medium">{formData.requester_name}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-600">Email:</dt>
                      <dd className="font-medium">{formData.requester_email}</dd>
                    </div>
                    {formData.requester_phone && (
                      <div>
                        <dt className="text-gray-600">Phone:</dt>
                        <dd className="font-medium">{formData.requester_phone}</dd>
                      </div>
                    )}
                    {formData.requester_organization && (
                      <div>
                        <dt className="text-gray-600">Organization:</dt>
                        <dd className="font-medium">{formData.requester_organization}</dd>
                      </div>
                    )}
                  </dl>
                </div>

                <div>
                  <h3 className="font-semibold text-lg mb-2">Records Requested</h3>
                  <dl className="space-y-2 text-sm">
                    <div>
                      <dt className="text-gray-600">Subject:</dt>
                      <dd className="font-medium">{formData.subject}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-600">Description:</dt>
                      <dd className="font-medium whitespace-pre-wrap">{formData.description}</dd>
                    </div>
                    {(formData.date_range_start || formData.date_range_end) && (
                      <div>
                        <dt className="text-gray-600">Date Range:</dt>
                        <dd className="font-medium">
                          {formData.date_range_start || 'Beginning'} to{' '}
                          {formData.date_range_end || 'Present'}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>

                <div>
                  <h3 className="font-semibold text-lg mb-2">Request Options</h3>
                  <dl className="space-y-2 text-sm">
                    {formData.category && (
                      <div>
                        <dt className="text-gray-600">Category:</dt>
                        <dd className="font-medium">{formData.category.replace('_', ' ')}</dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-gray-600">Processing:</dt>
                      <dd className="font-medium">
                        {formData.urgency === 'EXPEDITED' ? 'Expedited' : 'Standard'}
                      </dd>
                    </div>
                    {formData.fee_waiver_requested && (
                      <div>
                        <dt className="text-gray-600">Fee Waiver:</dt>
                        <dd className="font-medium">Requested</dd>
                      </div>
                    )}
                  </dl>
                </div>

                {errors.submit && (
                  <div className="alert alert-error" role="alert">
                    {errors.submit}
                  </div>
                )}

                <div className="alert alert-info">
                  <p className="text-sm">
                    By submitting this request, you confirm that the information provided is accurate
                    and that you understand your request will be processed according to applicable
                    FOIA regulations.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-8 pt-6 border-t">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={handlePrevious}
                className="btn btn-outline"
                disabled={isSubmitting}
              >
                Previous
              </button>
            ) : (
              <div></div>
            )}

            {currentStep < 4 ? (
              <button
                type="button"
                onClick={handleNext}
                className="btn btn-primary"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                className="btn btn-primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Submitting...' : 'Submit Request'}
              </button>
            )}
          </div>
        </div>

        {/* Auto-save notice */}
        <p className="text-center text-sm text-gray-500 mt-4">
          Your progress is automatically saved
        </p>
      </div>
    </div>
  );
}
