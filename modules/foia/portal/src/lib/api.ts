/**
 * FOIA API Client
 * Communicates with backend FOIA API
 */

import axios, { AxiosError } from 'axios';
import type {
  FOIARequest,
  FOIAResponse,
  FOIADocument,
  FOIAAppeal,
  Agency,
  RequestFormData,
  APIResponse,
  APIError,
} from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token if available
apiClient.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('foia_auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

/**
 * Error handler
 */
function handleError(error: AxiosError): APIError {
  if (error.response?.data) {
    const errData = error.response.data as { error?: { code?: string; message?: string; details?: unknown } };
    return {
      code: errData.error?.code || 'API_ERROR',
      message: errData.error?.message || 'An error occurred',
      details: errData.error?.details,
    };
  }
  return {
    code: 'NETWORK_ERROR',
    message: 'Unable to connect to server',
  };
}

/**
 * Submit FOIA request
 */
export async function submitRequest(
  data: Omit<RequestFormData, 'step'>
): Promise<APIResponse<FOIARequest>> {
  try {
    const response = await apiClient.post('/api/requests', data);
    return { success: true, data: response.data.data };
  } catch (error) {
    return { success: false, error: handleError(error as AxiosError) };
  }
}

/**
 * Get request by confirmation number
 */
export async function getRequestByConfirmation(
  confirmationNumber: string
): Promise<APIResponse<FOIARequest>> {
  try {
    const response = await apiClient.get(
      `/api/requests/status/${confirmationNumber}`
    );
    return { success: true, data: response.data.data };
  } catch (error) {
    return { success: false, error: handleError(error as AxiosError) };
  }
}

/**
 * Get request by ID
 */
export async function getRequestById(
  id: string
): Promise<APIResponse<FOIARequest>> {
  try {
    const response = await apiClient.get(`/api/requests/${id}`);
    return { success: true, data: response.data.data };
  } catch (error) {
    return { success: false, error: handleError(error as AxiosError) };
  }
}

/**
 * Get authenticated user's requests
 */
export async function getMyRequests(): Promise<APIResponse<FOIARequest[]>> {
  try {
    const response = await apiClient.get('/api/requests');
    return { success: true, data: response.data.data };
  } catch (error) {
    return { success: false, error: handleError(error as AxiosError) };
  }
}

/**
 * Get response by ID
 */
export async function getResponse(
  id: string
): Promise<APIResponse<FOIAResponse>> {
  try {
    const response = await apiClient.get(`/api/responses/${id}`);
    return { success: true, data: response.data.data };
  } catch (error) {
    return { success: false, error: handleError(error as AxiosError) };
  }
}

/**
 * Get response documents
 */
export async function getResponseDocuments(
  responseId: string
): Promise<APIResponse<FOIADocument[]>> {
  try {
    const response = await apiClient.get(
      `/api/responses/${responseId}/documents`
    );
    return { success: true, data: response.data.data };
  } catch (error) {
    return { success: false, error: handleError(error as AxiosError) };
  }
}

/**
 * Get document download URL
 */
export function getDocumentDownloadUrl(documentId: string): string {
  const token = typeof window !== 'undefined' 
    ? localStorage.getItem('foia_auth_token') 
    : null;
  
  return token
    ? `${API_URL}/api/documents/${documentId}/download?token=${token}`
    : `${API_URL}/api/documents/${documentId}/download`;
}

/**
 * Submit appeal
 */
export async function submitAppeal(
  requestId: string,
  data: { appeal_reason: string; appeal_details: string }
): Promise<APIResponse<FOIAAppeal>> {
  try {
    const response = await apiClient.post('/api/appeals', {
      foia_request_id: requestId,
      ...data,
    });
    return { success: true, data: response.data.data };
  } catch (error) {
    return { success: false, error: handleError(error as AxiosError) };
  }
}

/**
 * Get agencies directory
 */
export async function getAgencies(): Promise<APIResponse<Agency[]>> {
  try {
    const response = await apiClient.get('/api/agencies');
    return { success: true, data: response.data.data };
  } catch (error) {
    return { success: false, error: handleError(error as AxiosError) };
  }
}
