import { createBrowserRouter, Navigate } from 'react-router-dom';
import AdminLayout from '@/layouts/AdminLayout';
import DashboardPage from '@/pages/DashboardPage';
import RequestListPage from '@/pages/RequestListPage';
import RequestDetailPage from '@/pages/RequestDetailPage';
import RedactionWorkbenchPage from '@/pages/RedactionWorkbenchPage';
import ResponseDraftPage from '@/pages/ResponseDraftPage';
import ConsistencyCheckPage from '@/pages/ConsistencyCheckPage';
import VaughnIndexPage from '@/pages/VaughnIndexPage';
import RoutingRulesPage from '@/pages/RoutingRulesPage';
import SLAWallPage from '@/pages/SLAWallPage';
import AnalyticsPage from '@/pages/AnalyticsPage';
import WorkloadPredictionPage from '@/pages/WorkloadPredictionPage';
import PatternIntelligencePage from '@/pages/PatternIntelligencePage';
import ProactiveDisclosurePage from '@/pages/ProactiveDisclosurePage';
import TransparencyDashboardPage from '@/pages/TransparencyDashboardPage';
import CompliancePage from '@/pages/CompliancePage';
import MigrationDashboardPage from '@/pages/MigrationDashboardPage';
import FeeSchedulePage from '@/pages/FeeSchedulePage';
import TemplatePage from '@/pages/TemplatePage';
import JurisdictionPage from '@/pages/JurisdictionPage';
import UserManagementPage from '@/pages/UserManagementPage';
import IntegrationsPage from '@/pages/IntegrationsPage';
import BrandingPage from '@/pages/BrandingPage';
import AIConfigPage from '@/pages/AIConfigPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AdminLayout />,
    children: [
      {
        index: true,
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: 'dashboard',
        element: <DashboardPage />,
      },
      {
        path: 'requests',
        element: <RequestListPage />,
      },
      {
        path: 'requests/:id',
        element: <RequestDetailPage />,
      },
      {
        path: 'requests/:id/redaction',
        element: <RedactionWorkbenchPage />,
      },
      {
        path: 'requests/:id/response',
        element: <ResponseDraftPage />,
      },
      {
        path: 'requests/:id/consistency',
        element: <ConsistencyCheckPage />,
      },
      {
        path: 'requests/:id/vaughn',
        element: <VaughnIndexPage />,
      },
      {
        path: 'routing',
        element: <RoutingRulesPage />,
      },
      {
        path: 'sla-dashboard',
        element: <SLAWallPage />,
      },
      {
        path: 'analytics',
        element: <AnalyticsPage />,
      },
      {
        path: 'analytics/workload',
        element: <WorkloadPredictionPage />,
      },
      {
        path: 'analytics/patterns',
        element: <PatternIntelligencePage />,
      },
      {
        path: 'analytics/proactive',
        element: <ProactiveDisclosurePage />,
      },
      {
        path: 'analytics/transparency',
        element: <TransparencyDashboardPage />,
      },
      {
        path: 'compliance',
        element: <CompliancePage />,
      },
      {
        path: 'migration',
        element: <MigrationDashboardPage />,
      },
      {
        path: 'settings/fees',
        element: <FeeSchedulePage />,
      },
      {
        path: 'settings/templates',
        element: <TemplatePage />,
      },
      {
        path: 'settings/jurisdiction',
        element: <JurisdictionPage />,
      },
      {
        path: 'settings/users',
        element: <UserManagementPage />,
      },
      {
        path: 'settings/integrations',
        element: <IntegrationsPage />,
      },
      {
        path: 'settings/branding',
        element: <BrandingPage />,
      },
      {
        path: 'settings/ai',
        element: <AIConfigPage />,
      },
    ],
  },
]);
