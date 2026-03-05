import React, { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Button, Badge } from '@govli/foia-ui';
import CopilotPanel from '@/components/CopilotPanel';
import clsx from 'clsx';

interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: string;
  badge?: number;
  children?: NavItem[];
}

const navigationItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: '📊' },
  { id: 'requests', label: 'Requests', path: '/requests', icon: '📋', badge: 12 },
  { id: 'routing', label: 'Routing Rules', path: '/routing', icon: '🎯' },
  { id: 'sla', label: 'SLA Wall', path: '/sla-dashboard', icon: '⏰' },
  {
    id: 'analytics',
    label: 'Analytics',
    path: '/analytics',
    icon: '📈',
    children: [
      { id: 'analytics-main', label: 'Overview', path: '/analytics', icon: '📊' },
      { id: 'workload', label: 'Workload', path: '/analytics/workload', icon: '📅' },
      { id: 'patterns', label: 'Patterns', path: '/analytics/patterns', icon: '🔍' },
      { id: 'proactive', label: 'Proactive Disclosure', path: '/analytics/proactive', icon: '🌐' },
      { id: 'transparency', label: 'Transparency', path: '/analytics/transparency', icon: '👁️' },
    ],
  },
  { id: 'compliance', label: 'Compliance', path: '/compliance', icon: '✅' },
  { id: 'migration', label: 'Migration', path: '/migration', icon: '🔄' },
  {
    id: 'settings',
    label: 'Settings',
    path: '/settings',
    icon: '⚙️',
    children: [
      { id: 'fees', label: 'Fees', path: '/settings/fees', icon: '💰' },
      { id: 'templates', label: 'Templates', path: '/settings/templates', icon: '📝' },
      { id: 'jurisdiction', label: 'Jurisdiction', path: '/settings/jurisdiction', icon: '🏛️' },
      { id: 'users', label: 'Users', path: '/settings/users', icon: '👥' },
      { id: 'integrations', label: 'Integrations', path: '/settings/integrations', icon: '🔌' },
      { id: 'branding', label: 'Branding', path: '/settings/branding', icon: '🎨' },
      { id: 'ai', label: 'AI Config', path: '/settings/ai', icon: '🤖' },
    ],
  },
];

export default function AdminLayout() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>(['analytics', 'settings']);
  const location = useLocation();

  const toggleSidebar = () => setIsSidebarCollapsed(!isSidebarCollapsed);
  const toggleCopilot = () => setIsCopilotOpen(!isCopilotOpen);

  const toggleExpanded = (itemId: string) => {
    setExpandedItems((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId]
    );
  };

  const isActiveRoute = (path: string) => {
    if (path === '/analytics') {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  const renderNavItem = (item: NavItem, level: number = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.includes(item.id);
    const isActive = isActiveRoute(item.path);

    return (
      <div key={item.id}>
        <Link
          to={item.path}
          onClick={(e) => {
            if (hasChildren) {
              e.preventDefault();
              toggleExpanded(item.id);
            }
          }}
          className={clsx(
            'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors mb-1',
            level > 0 && 'ml-6 text-sm',
            isActive
              ? 'bg-blue-100 text-blue-700 font-semibold'
              : 'text-gray-700 hover:bg-gray-100',
            isSidebarCollapsed && level === 0 && 'justify-center'
          )}
          title={isSidebarCollapsed ? item.label : undefined}
        >
          <span className="text-xl">{item.icon}</span>
          {!isSidebarCollapsed && (
            <>
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <Badge variant="error" size="sm">
                  {item.badge}
                </Badge>
              )}
              {hasChildren && (
                <span className="text-gray-400">
                  {isExpanded ? '▼' : '▶'}
                </span>
              )}
            </>
          )}
        </Link>
        {hasChildren && isExpanded && !isSidebarCollapsed && (
          <div className="ml-3">
            {item.children!.map((child) => renderNavItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between z-30">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-blue-600">Govli AI</h1>
          <span className="text-sm text-gray-600">FOIA Admin Portal</span>
        </div>
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleCopilot}
            className={clsx(isCopilotOpen && 'bg-blue-100 text-blue-700')}
            aria-label="Toggle AI Copilot"
          >
            🤖 AI Copilot
          </Button>
          <button
            className="relative p-2 hover:bg-gray-100 rounded-full"
            aria-label="Notifications"
          >
            🔔
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>
          <button
            className="p-2 hover:bg-gray-100 rounded-full"
            aria-label="Settings"
          >
            ⚙️
          </button>
          <div className="flex items-center gap-2 pl-4 border-l border-gray-200">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
              A
            </div>
            <div className="hidden md:block">
              <p className="text-sm font-semibold text-gray-900">Admin User</p>
              <p className="text-xs text-gray-500">admin@agency.gov</p>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <aside
          className={clsx(
            'bg-white border-r border-gray-200 overflow-y-auto transition-all duration-300 z-20',
            isSidebarCollapsed ? 'w-20' : 'w-64'
          )}
          aria-label="Main navigation"
        >
          <div className="p-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleSidebar}
              className="w-full mb-4"
              aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isSidebarCollapsed ? '☰' : '✕'}
            </Button>
            <nav className="space-y-1">
              {navigationItems.map((item) => renderNavItem(item))}
            </nav>
          </div>
        </aside>

        {/* Main Content Area */}
        <main
          className={clsx(
            'flex-1 overflow-y-auto bg-gray-50 transition-all duration-300',
            isCopilotOpen && 'mr-96'
          )}
        >
          <div className="p-6">
            <Outlet />
          </div>
        </main>

        {/* Right Sidebar - AI Copilot */}
        <CopilotPanel isOpen={isCopilotOpen} onClose={() => setIsCopilotOpen(false)} />
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 px-6 py-3 flex items-center justify-between text-sm text-gray-600 z-30">
        <div className="flex items-center gap-4">
          <span>Powered by Govli AI</span>
          <span>•</span>
          <span>v1.0.0</span>
        </div>
        <div className="flex items-center gap-4">
          <a href="#" className="hover:text-blue-600 transition-colors">
            Support
          </a>
          <span>•</span>
          <a href="#" className="hover:text-blue-600 transition-colors">
            Documentation
          </a>
          <span>•</span>
          <a href="#" className="hover:text-blue-600 transition-colors">
            Privacy
          </a>
        </div>
      </footer>
    </div>
  );
}
