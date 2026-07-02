'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/SearchInput';
import { Filter, X, Sparkles, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TestCaseStatus, TestCaseFilters as Filters } from '@/lib/api';

interface TestCaseFiltersProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  className?: string;
}

type StatusOption = { value: TestCaseStatus | null; label: string; color: string };

const statusOptions: StatusOption[] = [
  { value: null, label: 'All', color: '' },
  { value: 'draft', label: 'Draft', color: 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20' },
  { value: 'accepted', label: 'Accepted', color: 'bg-green-500/10 text-green-400 hover:bg-green-500/20' },
  { value: 'rejected', label: 'Rejected', color: 'bg-red-500/10 text-red-400 hover:bg-red-500/20' },
];

export function TestCaseFilters({
  filters,
  onFiltersChange,
  className,
}: TestCaseFiltersProps) {
  const hasActiveFilters = 
    filters.status || 
    filters.is_edge_case || 
    filters.is_manual || 
    filters.search;

  const clearFilters = () => {
    onFiltersChange({});
  };

  const toggleStatus = (status: TestCaseStatus | null) => {
    onFiltersChange({
      ...filters,
      status: status === filters.status ? null : status,
    });
  };

  const toggleEdgeCase = () => {
    onFiltersChange({
      ...filters,
      is_edge_case: filters.is_edge_case ? null : true,
    });
  };

  const toggleManual = () => {
    onFiltersChange({
      ...filters,
      is_manual: filters.is_manual ? null : true,
    });
  };

  const setSearch = (search: string) => {
    onFiltersChange({
      ...filters,
      search: search || null,
    });
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Search and Clear Row */}
      <div className="flex items-center gap-3">
        <SearchInput
          value={filters.search || ''}
          onChange={setSearch}
          placeholder="Search test cases..."
          className="flex-1 max-w-sm"
        />
        
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4 mr-1" />
            Clear filters
          </Button>
        )}
      </div>

      {/* Filter Chips Row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground mr-2">
          <Filter className="w-4 h-4" />
          <span>Filters:</span>
        </div>

        {/* Status Filters — real buttons so they're keyboard-focusable and
            expose pressed state to screen readers (M22). */}
        <div className="flex items-center gap-1.5 border-r border-border pr-3 mr-1">
          {statusOptions.map((option) => {
            const active = filters.status === option.value;
            return (
              <button
                key={option.value ?? 'all'}
                type="button"
                aria-pressed={active}
                onClick={() => toggleStatus(option.value)}
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Badge
                  variant={active ? 'default' : 'outline'}
                  className={cn(
                    'cursor-pointer transition-colors',
                    active ? option.color : 'hover:bg-muted'
                  )}
                >
                  {option.label}
                </Badge>
              </button>
            );
          })}
        </div>

        {/* Type Filters */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-pressed={!!filters.is_edge_case}
            onClick={toggleEdgeCase}
            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Badge
              variant={filters.is_edge_case ? 'default' : 'outline'}
              className={cn(
                'cursor-pointer transition-colors',
                filters.is_edge_case
                  ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                  : 'hover:bg-muted'
              )}
            >
              <Sparkles className="w-3 h-3 mr-1" />
              Edge Cases
            </Badge>
          </button>

          <button
            type="button"
            aria-pressed={!!filters.is_manual}
            onClick={toggleManual}
            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Badge
              variant={filters.is_manual ? 'default' : 'outline'}
              className={cn(
                'cursor-pointer transition-colors',
                filters.is_manual
                  ? 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20'
                  : 'hover:bg-muted'
              )}
            >
              <Pencil className="w-3 h-3 mr-1" />
              Manual
            </Badge>
          </button>
        </div>
      </div>
    </div>
  );
}




