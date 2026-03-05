import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  ColumnDef,
  SortingState,
  FilterFn,
} from '@tanstack/react-table';
import { Card, Button, Badge, StatusBadge } from '@govli/foia-ui';
import { format } from 'date-fns';
import clsx from 'clsx';

// Mock data types
interface FOIARequest {
  id: string;
  requester: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'on_hold';
  department: string;
  deadline: Date;
  slaStatus: 'overdue' | 'critical' | 'at_risk' | 'on_track';
  assignedTo: string;
  aiScopingScore: number;
  triageStatus: 'complete' | 'pending' | 'in_progress';
  createdAt: Date;
}

// Generate mock data
const generateMockData = (): FOIARequest[] => {
  const statuses: FOIARequest['status'][] = ['pending', 'in_progress', 'completed', 'on_hold'];
  const slaStatuses: FOIARequest['slaStatus'][] = ['overdue', 'critical', 'at_risk', 'on_track'];
  const departments = ['Legal', 'HR', 'Finance', 'Operations', 'IT', 'Public Relations'];
  const officers = ['John Doe', 'Jane Smith', 'Bob Wilson', 'Alice Johnson', 'Charlie Brown'];
  const triageStatuses: FOIARequest['triageStatus'][] = ['complete', 'pending', 'in_progress'];

  return Array.from({ length: 50 }, (_, i) => ({
    id: `REQ-${2000 + i}`,
    requester: `Requester ${i + 1}`,
    description: `Request for documents related to ${['budget', 'contracts', 'emails', 'reports', 'policies'][i % 5]} from ${2020 + (i % 4)}`,
    status: statuses[i % statuses.length],
    department: departments[i % departments.length],
    deadline: new Date(Date.now() + (i % 30) * 24 * 60 * 60 * 1000),
    slaStatus: slaStatuses[i % slaStatuses.length],
    assignedTo: officers[i % officers.length],
    aiScopingScore: Math.floor(Math.random() * 100),
    triageStatus: triageStatuses[i % triageStatuses.length],
    createdAt: new Date(Date.now() - (i * 24 * 60 * 60 * 1000)),
  }));
};

const columnHelper = createColumnHelper<FOIARequest>();

export default function RequestListPage() {
  const navigate = useNavigate();
  const [data] = useState<FOIARequest[]>(generateMockData());
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [slaFilter, setSlaFilter] = useState<string>('all');
  const [selectedRows, setSelectedRows] = useState<string[]>([]);

  const columns = useMemo<ColumnDef<FOIARequest, any>[]>(
    () => [
      columnHelper.display({
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
            className="w-4 h-4 rounded border-gray-300"
            aria-label="Select all rows"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            className="w-4 h-4 rounded border-gray-300"
            aria-label={`Select row ${row.original.id}`}
          />
        ),
      }),
      columnHelper.accessor('id', {
        header: 'ID',
        cell: (info) => (
          <button
            onClick={() => navigate(`/requests/${info.getValue()}`)}
            className="text-blue-600 hover:text-blue-800 font-semibold"
          >
            {info.getValue()}
          </button>
        ),
      }),
      columnHelper.accessor('requester', {
        header: 'Requester',
        cell: (info) => <span className="font-medium">{info.getValue()}</span>,
      }),
      columnHelper.accessor('description', {
        header: 'Description',
        cell: (info) => (
          <span className="text-sm text-gray-700 truncate max-w-xs block">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (info) => <StatusBadge status={info.getValue()} />,
      }),
      columnHelper.accessor('department', {
        header: 'Department',
        cell: (info) => <span className="text-sm">{info.getValue()}</span>,
      }),
      columnHelper.accessor('deadline', {
        header: 'Deadline',
        cell: (info) => (
          <span className="text-sm">{format(info.getValue(), 'MMM dd, yyyy')}</span>
        ),
      }),
      columnHelper.accessor('slaStatus', {
        header: 'SLA Status',
        cell: (info) => {
          const status = info.getValue();
          const colors = {
            overdue: 'bg-red-100 text-red-800',
            critical: 'bg-orange-100 text-orange-800',
            at_risk: 'bg-yellow-100 text-yellow-800',
            on_track: 'bg-green-100 text-green-800',
          };
          return (
            <Badge variant={status === 'overdue' ? 'error' : status === 'critical' ? 'warning' : status === 'at_risk' ? 'info' : 'success'}>
              {status.replace('_', ' ').toUpperCase()}
            </Badge>
          );
        },
      }),
      columnHelper.accessor('assignedTo', {
        header: 'Assigned To',
        cell: (info) => <span className="text-sm">{info.getValue()}</span>,
      }),
      columnHelper.accessor('aiScopingScore', {
        header: 'AI Score',
        cell: (info) => {
          const score = info.getValue();
          return (
            <div className="flex items-center gap-2">
              <div className="w-16 bg-gray-200 rounded-full h-2">
                <div
                  className={clsx(
                    'h-2 rounded-full',
                    score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                  )}
                  style={{ width: `${score}%` }}
                ></div>
              </div>
              <span className="text-xs font-semibold">{score}</span>
            </div>
          );
        },
      }),
      columnHelper.accessor('triageStatus', {
        header: 'Triage',
        cell: (info) => {
          const status = info.getValue();
          return (
            <Badge
              variant={
                status === 'complete'
                  ? 'success'
                  : status === 'in_progress'
                  ? 'warning'
                  : 'default'
              }
            >
              {status.replace('_', ' ')}
            </Badge>
          );
        },
      }),
    ],
    [navigate]
  );

  const filteredData = useMemo(() => {
    return data.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (departmentFilter !== 'all' && row.department !== departmentFilter) return false;
      if (slaFilter !== 'all' && row.slaStatus !== slaFilter) return false;
      return true;
    });
  }, [data, statusFilter, departmentFilter, slaFilter]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  const departments = Array.from(new Set(data.map((r) => r.department)));

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">FOIA Requests</h1>
          <p className="text-gray-600 mt-1">Manage and track all FOIA requests</p>
        </div>
        <Button onClick={() => navigate('/requests/new')}>+ New Request</Button>
      </div>

      {/* Filters and Search */}
      <Card className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="md:col-span-2">
            <input
              type="text"
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder="Search requests..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Search requests"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Filter by status"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="on_hold">On Hold</option>
          </select>

          {/* Department Filter */}
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Filter by department"
          >
            <option value="all">All Departments</option>
            {departments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-4 mt-4">
          {/* SLA Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700">SLA Status:</span>
            <div className="flex gap-2">
              {['all', 'overdue', 'critical', 'at_risk', 'on_track'].map((status) => (
                <button
                  key={status}
                  onClick={() => setSlaFilter(status)}
                  className={clsx(
                    'px-3 py-1 rounded-full text-xs font-semibold transition-colors',
                    slaFilter === status
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  )}
                >
                  {status.replace('_', ' ').toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Bulk Actions */}
        {table.getSelectedRowModel().rows.length > 0 && (
          <div className="mt-4 flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
            <span className="text-sm font-semibold text-blue-900">
              {table.getSelectedRowModel().rows.length} selected
            </span>
            <Button variant="outline" size="sm">
              Assign
            </Button>
            <Button variant="outline" size="sm">
              Change Status
            </Button>
            <Button variant="outline" size="sm">
              Export CSV
            </Button>
          </div>
        )}
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-center gap-2">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() && (
                          <span>{header.column.getIsSorted() === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-6 py-4 whitespace-nowrap">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700">
              Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} to{' '}
              {Math.min(
                (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                filteredData.length
              )}{' '}
              of {filteredData.length} results
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <span className="text-sm text-gray-700">
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
