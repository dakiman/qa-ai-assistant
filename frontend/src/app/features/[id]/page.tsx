'use client';

import { useState, useCallback, useMemo } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { TestCaseCard } from '@/components/TestCaseCard';
import { AddTestCaseDialog } from '@/components/AddTestCaseDialog';
import { RefineActionBar } from '@/components/RefineActionBar';
import { ExportButton } from '@/components/ExportButton';
import { TestCaseFilters } from '@/components/TestCaseFilters';
import { LinkManager } from '@/components/LinkManager';
import { ChevronLeft, Pencil, Check, Plus, ClipboardCheck } from 'lucide-react';
import { useFeatureDetail, useFeatureTestCases, queryKeys } from '@/lib/queries';
import { useQueryClient } from '@tanstack/react-query';
import type { TestCase, RefinementResponse, TestCaseFilters as Filters, TestCaseStatus } from '@/lib/api';

export default function FeatureDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const featureId = parseInt(params.id as string);
  const queryClient = useQueryClient();
  
  const [refinementMessage, setRefinementMessage] = useState<string | null>(null);

  // Parse filters from URL
  const filters: Filters = useMemo(() => ({
    status: (searchParams.get('status') as TestCaseStatus) || null,
    is_edge_case: searchParams.get('edge') === 'true' ? true : null,
    is_manual: searchParams.get('manual') === 'true' ? true : null,
    search: searchParams.get('q') || null,
  }), [searchParams]);

  // Update URL when filters change
  const setFilters = useCallback((newFilters: Filters) => {
    const params = new URLSearchParams();
    
    if (newFilters.status) {
      params.set('status', newFilters.status);
    }
    if (newFilters.is_edge_case) {
      params.set('edge', 'true');
    }
    if (newFilters.is_manual) {
      params.set('manual', 'true');
    }
    if (newFilters.search) {
      params.set('q', newFilters.search);
    }
    
    const queryString = params.toString();
    router.replace(`/features/${featureId}${queryString ? `?${queryString}` : ''}`, { scroll: false });
  }, [featureId, router]);

  // Fetch with filters
  const { feature, isLoading: featureLoading, error: featureError } = useFeatureDetail(featureId);
  const { data: filteredTestCases = [], isLoading: testCasesLoading } = useFeatureTestCases(featureId, filters);
  
  // Also fetch unfiltered test cases for stats (only when filters are active)
  const hasActiveFilters = !!(filters.status || filters.is_edge_case || filters.is_manual || filters.search);
  const { data: allTestCases = [] } = useFeatureTestCases(featureId, undefined, {
    enabled: hasActiveFilters,
  });
  
  // Use filtered test cases for display, unfiltered for stats
  const testCases = filteredTestCases;
  const testCasesForStats = hasActiveFilters ? allTestCases : filteredTestCases;
  const isLoading = featureLoading || testCasesLoading;
  const error = featureError;

  const handleTestCaseStatusChange = (updatedCase: TestCase) => {
    // Optimistically update the cache
    queryClient.setQueryData<TestCase[]>(
      queryKeys.features.testCases(featureId),
      (old) => old?.map(tc => tc.id === updatedCase.id ? updatedCase : tc) ?? []
    );
  };

  const handleTestCaseAdded = () => {
    // Invalidate to refetch test cases
    queryClient.invalidateQueries({ 
      queryKey: queryKeys.features.testCases(featureId) 
    });
  };

  const handleRefinementComplete = (response: RefinementResponse) => {
    // Update the cache with refined test cases
    queryClient.setQueryData(
      queryKeys.features.testCases(featureId),
      response.test_cases
    );
    setRefinementMessage(response.message);
    // Clear message after 5 seconds
    setTimeout(() => setRefinementMessage(null), 5000);
  };

  // Calculate stats from all test cases (not filtered)
  const stats = {
    total: testCasesForStats.length,
    draft: testCasesForStats.filter((tc) => tc.status === 'draft').length,
    accepted: testCasesForStats.filter((tc) => tc.status === 'accepted').length,
    rejected: testCasesForStats.filter((tc) => tc.status === 'rejected').length,
    edgeCases: testCasesForStats.filter((tc) => tc.is_edge_case).length,
    manual: testCasesForStats.filter((tc) => tc.is_manual).length,
  };
  
  // Count of filtered results
  const filteredCount = testCases.length;

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="animate-pulse">
          <div className="h-8 w-1/3 bg-muted rounded mb-2" />
          <div className="h-4 w-2/3 bg-muted rounded" />
        </div>
        <div className="grid gap-4 md:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="pt-6">
                <div className="h-8 w-1/2 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !feature) {
    return (
      <Card className="border-destructive/50 bg-destructive/10">
        <CardContent className="pt-6 text-center">
          <p className="text-destructive mb-4">{error?.message || 'Feature not found'}</p>
          <Link href="/features">
            <Button variant="outline">Back to Features</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8 pb-24">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link href="/features" className="text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-3xl font-bold tracking-tight">{feature.title}</h1>
            <Badge variant="outline">#{feature.id}</Badge>
          </div>
          <p className="text-muted-foreground">
            {feature.description || 'No description provided'}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <ExportButton featureId={featureId} />
          <Button variant="outline">
            <Pencil className="w-4 h-4 mr-2" />
            Edit Feature
          </Button>
        </div>
      </div>

      {/* Refinement Success Message */}
      {refinementMessage && (
        <Card className="border-green-500/50 bg-green-500/10 animate-in slide-in-from-top-2">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-green-500/20 flex items-center justify-center">
                <Check className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="font-medium text-green-400">Refinement Complete!</p>
                <p className="text-sm text-green-400/80">{refinementMessage}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-3xl font-bold text-primary">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Draft</p>
            <p className="text-3xl font-bold text-blue-400">{stats.draft}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Accepted</p>
            <p className="text-3xl font-bold text-green-400">{stats.accepted}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Rejected</p>
            <p className="text-3xl font-bold text-red-400">{stats.rejected}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Edge Cases</p>
            <p className="text-3xl font-bold text-amber-400">{stats.edgeCases}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Manual</p>
            <p className="text-3xl font-bold text-blue-400">{stats.manual}</p>
          </CardContent>
        </Card>
      </div>

      {/* Requirements and Links */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Requirements */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Requirements</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap font-mono text-sm bg-muted/50 p-4 rounded-lg max-h-64 overflow-auto">
              {feature.raw_requirements}
            </pre>
          </CardContent>
        </Card>

        {/* Linked Context */}
        <LinkManager featureId={featureId} />
      </div>

      <Separator />

      {/* Test Cases */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Test Cases</h2>
          <AddTestCaseDialog
            featureId={featureId}
            onTestCaseAdded={handleTestCaseAdded}
          />
        </div>

        {/* Filters */}
        <TestCaseFilters
          filters={filters}
          onFiltersChange={setFilters}
          className="mb-6"
        />

        {/* Filtered Results Count */}
        {hasActiveFilters && (
          <div className="text-sm text-muted-foreground mb-4">
            Showing {filteredCount} of {stats.total} test cases
          </div>
        )}

        {testCases.length === 0 && !hasActiveFilters ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <ClipboardCheck className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">No test cases generated yet</p>
              <AddTestCaseDialog
                featureId={featureId}
                onTestCaseAdded={handleTestCaseAdded}
                trigger={
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Manual Test Case
                  </Button>
                }
              />
            </CardContent>
          </Card>
        ) : testCases.length === 0 && hasActiveFilters ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <ClipboardCheck className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">No test cases match your filters</p>
              <Button variant="outline" onClick={() => setFilters({})}>
                Clear Filters
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {testCases.map((testCase) => (
              <TestCaseCard
                key={testCase.id}
                testCase={testCase}
                onStatusChange={handleTestCaseStatusChange}
              />
            ))}
          </div>
        )}
      </div>

      {/* Floating Refine Action Bar - use unfiltered test cases */}
      <RefineActionBar
        featureId={featureId}
        testCases={testCasesForStats}
        onRefinementComplete={handleRefinementComplete}
      />
    </div>
  );
}
