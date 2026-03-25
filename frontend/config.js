// API Configuration
const API_CONFIG = {
  // Use production API when deployed, localhost when running locally
  BASE_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://govli-ai.onrender.com',
  
  ENDPOINTS: {
    AUTH: {
      LOGIN: '/api/auth/login',
      REGISTER: '/api/auth/register'
    },
    PERMITS: {
      LIST: '/api/permits',
      CREATE: '/api/permits',
      GET: (id) => `/api/permits/${id}`,
      UPDATE: (id) => `/api/permits/${id}`,
      DELETE: (id) => `/api/permits/${id}`,
      UPDATE_STATUS: (id) => `/api/permits/${id}/status`,
      STATS: '/api/permits/stats',
      SEARCH: '/api/permits/search'
    },
    DASHBOARD: {
      METRICS: '/api/dashboard/metrics'
    },
    WORKFLOWS: {
      LIST: '/api/workflows',
      GET: (id) => `/api/workflows/${id}`,
      EXECUTIONS: '/api/workflows/executions/list',
      EXECUTION_GET: (id) => `/api/workflows/executions/${id}`,
      RESUME: (id) => `/api/workflows/executions/${id}/resume`,
      CANCEL: (id) => `/api/workflows/executions/${id}/cancel`
    },
    TASKS: {
      LIST: '/api/workflows/tasks',
      COMPLETE: (id) => `/api/workflows/tasks/${id}/complete`
    },
    DOCUMENTS: {
      LIST: '/api/documents',
      GET: (id) => `/api/documents/${id}`,
      UPLOAD: '/api/documents/upload',
      DOWNLOAD: (id) => `/api/documents/${id}/download`,
      DELETE: (id) => `/api/documents/${id}`,
      REQUIREMENTS: (permitType) => `/api/documents/requirements/${permitType}`,
      VALIDATE: (permitId) => `/api/documents/validate/${permitId}`,
      STATS: (permitId) => `/api/documents/stats/${permitId}`,
      CATEGORIZE: (id) => `/api/documents/${id}/categorize`,
      PROCESS: (id) => `/api/documents/${id}/process`,
      BULK_PROCESS: (permitId) => `/api/documents/bulk-process/${permitId}`,
      SEARCH: '/api/documents/search'
    },
    ANALYTICS: {
      DASHBOARD: '/api/analytics/dashboard',
      PERMITS: '/api/analytics/permits',
      WORKFLOWS: '/api/analytics/workflows',
      TASKS: '/api/analytics/tasks',
      WORKFLOW_PERFORMANCE: '/api/analytics/workflow-performance',
      STAFF_PRODUCTIVITY: '/api/analytics/staff-productivity',
      EXPORT: (dataType) => `/api/analytics/export/${dataType}`
    },
    INSPECTIONS: {
      LIST: '/api/inspections',
      GET: (id) => `/api/inspections/${id}`,
      CREATE: '/api/inspections',
      UPDATE: (id) => `/api/inspections/${id}`,
      COMPLETE: (id) => `/api/inspections/${id}/complete`,
      CANCEL: (id) => `/api/inspections/${id}`,
      CHECKLIST_TEMPLATE: (permitType, inspectionType) => `/api/inspections/checklist/${permitType}/${inspectionType}`,
      REQUIRED_INSPECTIONS: (permitType) => `/api/inspections/required/${permitType}`,
      AVAILABLE_INSPECTORS: '/api/inspections/available-inspectors',
      AUTO_ASSIGN: (id) => `/api/inspections/${id}/auto-assign`,
      UPDATE_CHECKLIST: (id) => `/api/inspections/${id}/checklist`,
      REINSPECT: (id) => `/api/inspections/${id}/reinspect`,
      STATS: '/api/inspections/stats'
    },
    CRM: {
      LIST_CONTACTS: '/api/crm/contacts',
      GET_CONTACT: (id) => `/api/crm/contacts/${id}`,
      CREATE_CONTACT: '/api/crm/contacts',
      UPDATE_CONTACT: (id) => `/api/crm/contacts/${id}`,
      DELETE_CONTACT: (id) => `/api/crm/contacts/${id}`,
      LOG_INTERACTION: (id) => `/api/crm/contacts/${id}/interactions`,
      FIND_DUPLICATES: (id) => `/api/crm/contacts/${id}/duplicates`,
      MERGE_CONTACTS: (id) => `/api/crm/contacts/${id}/merge`,
      STATS: '/api/crm/stats',
      IMPORT: '/api/crm/import',
      EXPORT: '/api/crm/export',
      LIST_INTERACTIONS: '/api/crm/interactions'
    },
    GRANTS: {
      LIST: '/api/grants',
      GET: (id) => `/api/grants/${id}`,
      CREATE: '/api/grants',
      UPDATE: (id) => `/api/grants/${id}`,
      DELETE: (id) => `/api/grants/${id}`,
      MATCH: '/api/grants/match',
      STATS: '/api/grants/stats/overview',
      SYNC: '/api/grants/sync',
      APPLICATIONS: {
        LIST: '/api/grants/applications/list',
        GET: (id) => `/api/grants/applications/${id}`,
        CREATE: '/api/grants/applications',
        UPDATE: (id) => `/api/grants/applications/${id}`,
        SUBMIT: (id) => `/api/grants/applications/${id}/submit`,
        REVIEW: (id) => `/api/grants/applications/${id}/review`,
        DECISION: (id) => `/api/grants/applications/${id}/decision`,
        DELETE: (id) => `/api/grants/applications/${id}`
      }
    },
    PAYMENTS: {
      LIST: '/api/payments',
      GET: (id) => `/api/payments/${id}`,
      CREATE: '/api/payments',
      PROCESS: (id) => `/api/payments/${id}/process`,
      REFUND: (id) => `/api/payments/${id}/refund`,
      STATS: '/api/payments/stats/summary',
      INVOICE: (id) => `/api/payments/invoice/${id}`,
      RECEIPT: (id) => `/api/payments/receipt/${id}`
    },
    NOTIFICATIONS: {
      LIST: '/api/notifications',
      UNREAD_COUNT: '/api/notifications/unread-count',
      GET: (id) => `/api/notifications/${id}`,
      MARK_READ: (id) => `/api/notifications/${id}/read`,
      MARK_ALL_READ: '/api/notifications/mark-all-read',
      DELETE: (id) => `/api/notifications/${id}`,
      CLEAR_ALL: '/api/notifications/clear-all',
      SEND: '/api/notifications/send',
      BROADCAST: '/api/notifications/broadcast'
    },
    SECUREMESH: {
      CHANNELS: {
        LIST: '/api/securemesh/channels',
        GET: (id) => `/api/securemesh/channels/${id}`,
        CREATE: '/api/securemesh/channels',
        UPDATE: (id) => `/api/securemesh/channels/${id}`,
        DELETE: (id) => `/api/securemesh/channels/${id}`,
        STATS: (id) => `/api/securemesh/channels/${id}/stats`,
        MARK_READ: (id) => `/api/securemesh/channels/${id}/read`
      },
      MESSAGES: {
        SEND: (channelId) => `/api/securemesh/channels/${channelId}/messages`,
        GET: (id) => `/api/securemesh/messages/${id}`,
        UPDATE: (id) => `/api/securemesh/messages/${id}`,
        DELETE: (id) => `/api/securemesh/messages/${id}`
      },
      MEMBERS: {
        ADD: (channelId) => `/api/securemesh/channels/${channelId}/members`,
        REMOVE: (channelId, userId) => `/api/securemesh/channels/${channelId}/members/${userId}`,
        UPDATE: (channelId, userId) => `/api/securemesh/channels/${channelId}/members/${userId}`
      }
    },
    FOIA: {
      // Citizen/Public endpoints
      SUBMIT_REQUEST: '/api/foia/requests',
      TRACK_REQUEST: (trackingNumber) => `/api/foia/requests/${trackingNumber}/status`,
      AI_ANALYZE: '/api/foia/ai/analyze-request',
      AI_SUGGEST: '/api/foia/ai/suggest',

      // Admin endpoints
      ADMIN: {
        DASHBOARD: '/api/foia/admin/dashboard',
        REQUESTS: '/api/foia/admin/requests',
        REQUEST_GET: (id) => `/api/foia/admin/requests/${id}`,
        REQUEST_UPDATE: (id) => `/api/foia/admin/requests/${id}`,
        REQUEST_ASSIGN: (id) => `/api/foia/admin/requests/${id}/assign`,
        DOCUMENTS: '/api/foia/admin/documents',
        DOCUMENT_ANALYZE: (id) => `/api/foia/admin/documents/${id}/analyze`,
        DOCUMENT_ANALYSIS: (id) => `/api/foia/admin/documents/${id}/analysis`,
        DOCUMENT_REDACT: (id) => `/api/foia/admin/documents/${id}/apply-redactions`,
        BATCH_ANALYZE: '/api/foia/admin/documents/batch-analyze'
      }
    }
  }
};

// Helper function to make API calls
async function apiCall(endpoint, options = {}) {
  const url = API_CONFIG.BASE_URL + endpoint;
  
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
    }
  };
  
  // Add auth token if available
  const token = localStorage.getItem('authToken');
  if (token) {
    defaultOptions.headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(url, { ...defaultOptions, ...options });
  
  if (!response.ok) {
    throw new Error(`API call failed: ${response.statusText}`);
  }
  
  return response.json();
}
