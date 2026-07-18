'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TestCaseCard } from '@/components/TestCaseCard';
import { AddTestCaseDialog } from '@/components/AddTestCaseDialog';
import { RefineActionBar } from '@/components/RefineActionBar';
import { ExportButton } from '@/components/ExportButton';
import { TestCaseFilters } from '@/components/TestCaseFilters';
import { LinkManager } from '@/components/LinkManager';
import { EditFeatureDialog } from '@/components/EditFeatureDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ChevronLeft, Pencil, Check, Plus, ClipboardCheck, RefreshCw, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { useFeature, useFeatureTestCases, useGenerateTestCases, useDeleteFeature, useTemplates, queryKeys } from '@/lib/queries';
import { useQueryClient } from '@tanstack/react-query';
import type { TestCase, RefinementResponse, TestCaseFilters as Filters, TestCaseStatus } from '@/lib/api';
import { NO_TEMPLATE_VALUE } from '@/lib/utils';

const DEFAULT_TARGET_COUNT = 10;

// Only these are real test case statuses — a bogus `?status=` param used to be
// cast blindly, 422 on the backend, and masquerade as an empty result (B2).
const VALID_TEST_CASE_STATUSES: readonly TestCaseStatus[] = ['draft', 'accepted', 'rejected'];

function parseStatusParam(raw: string | null): TestCaseStatus | null {
  return raw && (VALID_TEST_CASE_STATUSES as readonly string[]).includes(raw)
    ? (raw as TestCaseStatus)
    : null;
}

export default function FeatureDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const featureId = parseInt(params.id as string);
  const queryClient = useQueryClient();
  
  const [refinementMessage, setRefinementMessage] = useState<string | null>(null);
  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false);
  const [regenerateTemplateId, setRegenerateTemplateId] = useState<string>(NO_TEMPLATE_VALUE);
  const [regenerateTargetCount, setRegenerateTargetCount] = useState(DEFAULT_TARGET_COUNT);
  const generateMutation = useGenerateTestCases();
  const { data: templates = [] } = useTemplates();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const deleteFeatureMutation = useDeleteFeature();

  const handleDeleteFeature = async () => {
    try {
      await deleteFeatureMutation.mutateAsync(featureId);
      router.push('/features');
      // Deliberately NOT calling queryClient.removeQueries() here. router.push()
      // returns before navigation commits/unmounts this page, so this component
      // (and its detail/testCases observers under the ['features', id] prefix)
      // is still actively mounted at this point — removing their query would
      // trigger an immediate refetch-a-404 by the still-mounted observers, the
      // exact race B4 was meant to kill (it resurfaced here, from this cleanup
      // itself, after the mutation hook's own invalidate was fixed to be
      // list-scoped). Once navigation actually unmounts the page, these queries
      // go inactive and TanStack garbage-collects them after gcTime on its own
      // — no manual removal needed. A stale cache entry for a deleted feature
      // in the meantime is harmless: revisiting the URL just refetches, gets a
      // 404, and shows the error card, which is correct behavior anyway (B4
      // follow-up 2).
    } catch (err) {
      // Global toast surfaces the failure.
      console.error('Failed to delete feature:', err);
    }
  };

  // Parse filters from URL
  const filters: Filters = useMemo(() => ({
    status: parseStatusParam(searchParams.get('status')),
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

  // Fetch the feature and the filtered test cases. Using useFeature (not
  // useFeatureDetail) avoids mounting a second, always-on unfiltered query — the
  // unfiltered fetch below is now gated by hasActiveFilters and no longer dead (M20).
  const { data: feature, isLoading: featureLoading, error: featureError } = useFeature(featureId);
  const {
    data: filteredTestCases = [],
    isLoading: testCasesLoading,
    error: testCasesError,
    refetch: refetchTestCases,
  } = useFeatureTestCases(featureId, filters);

  // Also fetch unfiltered test cases for stats (only when filters are active;
  // with no filters the filtered query already returns the full set).
  const hasActiveFilters = !!(filters.status || filters.is_edge_case || filters.is_manual || filters.search);
  const { data: allTestCases = [] } = useFeatureTestCases(featureId, undefined, {
    enabled: hasActiveFilters,
  });
  
  // Use filtered test cases for display, unfiltered for stats
  const testCases = filteredTestCases;
  const testCasesForStats = hasActiveFilters ? allTestCases : filteredTestCases;
  // Gate the full-page skeleton on the feature load only. Filtered test cases use
  // keepPreviousData, so a filter change keeps the page (and search input) mounted.
  const isLoading = featureLoading;
  const error = featureError;

  const handleTestCaseStatusChange = (updatedCase: TestCase) => {
    // Patch every cached test-case list for this feature (filtered + unfiltered)
    // so the change shows immediately regardless of active filters. Return `old`
    // untouched when a cache is empty — writing a fresh [] used to briefly render
    // "No test cases generated yet" with a new dataUpdatedAt (M19).
    queryClient.setQueriesData<TestCase[]>(
      { queryKey: ['features', featureId, 'testCases'] },
      (old) => (old ? old.map(tc => tc.id === updatedCase.id ? updatedCase : tc) : old)
    );
  };

  const handleTestCaseAdded = () => {
    // Invalidate to refetch test cases
    queryClient.invalidateQueries({ 
      queryKey: queryKeys.features.testCases(featureId) 
    });
  };

  const handleRegenerate = async () => {
    try {
      await generateMutation.mutateAsync({
        feature_id: featureId,
        force_regenerate: true,
        template_id:
          regenerateTemplateId && regenerateTemplateId !== NO_TEMPLATE_VALUE
            ? parseInt(regenerateTemplateId)
            : undefined,
        target_count: regenerateTargetCount,
      });
      // useGenerateTestCases' onSuccess already invalidates both the test cases
      // and the feature detail (generation_count badge) — no need to duplicate
      // that here (B5).
      setRegenerateDialogOpen(false);
    } catch (err) {
      console.error('Failed to regenerate test cases:', err);
    }
  };

  // Reset the regenerate dialog's controls each time it opens so a previous
  // pick doesn't linger silently.
  const handleRegenerateDialogChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setRegenerateTemplateId(NO_TEMPLATE_VALUE);
      setRegenerateTargetCount(DEFAULT_TARGET_COUNT);
    }
    setRegenerateDialogOpen(nextOpen);
  };

  // For a feature that has never generated (e.g. the wizard was abandoned after
  // create-but-before-generate), there's nothing to destroy, so this fires the
  // mutation directly with no confirm dialog (B1).
  const handleFirstGenerate = async () => {
    try {
      await generateMutation.mutateAsync({
        feature_id: featureId,
        force_regenerate: false,
      });
    } catch (err) {
      console.error('Failed to generate test cases:', err);
    }
  };

  const handleRefinementComplete = (response: RefinementResponse) => {
    // useRefineTestSuite's onSuccess already writes response.test_cases into the
    // cache and invalidates the feature detail — this only needs to surface the
    // success banner (B5).
    setRefinementMessage(response.message);
  };

  // Auto-dismiss the refinement message 5s after it appears. Keying the timer
  // on the message value resets it on each new refinement (so a rapid second
  // refinement isn't cut short by the first timer) and cleans up on unmount.
  useEffect(() => {
    if (!refinementMessage) return;
    const timer = setTimeout(() => setRefinementMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [refinementMessage]);

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
    <div className="space-y-8 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link href="/features" className="text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-3xl font-bold tracking-tight">{feature.title}</h1>
            <Badge variant="outline">#{feature.id}</Badge>
            <Badge variant="outline" className="text-xs text-muted-foreground">
              Gen {feature.generation_count ?? 0} · Refine {feature.refinement_count ?? 0}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {feature.description || 'No description provided'}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <ExportButton featureId={featureId} />
          {(feature.generation_count ?? 0) === 0 ? (
            <Button
              variant="outline"
              onClick={handleFirstGenerate}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Generate Test Cases
                </>
              )}
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => handleRegenerateDialogChange(true)}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Regenerate
            </Button>
          )}
          <EditFeatureDialog
            feature={feature}
            trigger={
              <Button variant="outline">
                <Pencil className="w-4 h-4 mr-2" />
                Edit Feature
              </Button>
            }
          />
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
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
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl sm:text-3xl font-bold text-primary">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Draft</p>
            <p className="text-2xl sm:text-3xl font-bold text-blue-400">{stats.draft}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Accepted</p>
            <p className="text-2xl sm:text-3xl font-bold text-green-400">{stats.accepted}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Rejected</p>
            <p className="text-2xl sm:text-3xl font-bold text-red-400">{stats.rejected}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Edge Cases</p>
            <p className="text-2xl sm:text-3xl font-bold text-amber-400">{stats.edgeCases}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Manual</p>
            <p className="text-2xl sm:text-3xl font-bold text-blue-400">{stats.manual}</p>
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

        {testCasesLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-5 w-2/3 bg-muted rounded" />
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="h-4 w-full bg-muted rounded" />
                  <div className="h-4 w-5/6 bg-muted rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : testCasesError ? (
          <Card className="border-destructive/50 bg-destructive/10">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <AlertTriangle className="w-10 h-10 text-destructive mb-4" />
              <p className="text-destructive mb-4">
                {testCasesError.message || 'Failed to load test cases'}
              </p>
              <Button variant="outline" onClick={() => refetchTestCases()}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : testCases.length === 0 && !hasActiveFilters ? (
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
        refinementCount={feature.refinement_count ?? 0}
        onRefinementComplete={handleRefinementComplete}
      />

      {/* Regenerate Confirmation Dialog */}
      <Dialog open={regenerateDialogOpen} onOpenChange={handleRegenerateDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate test cases?</DialogTitle>
            <DialogDescription>
              This will delete the {stats.draft} existing draft case{stats.draft === 1 ? '' : 's'}. Accepted, rejected, and manual cases are preserved.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="regenerate-template">Generation Template</Label>
              <Select
                value={regenerateTemplateId}
                onValueChange={setRegenerateTemplateId}
                disabled={generateMutation.isPending}
              >
                <SelectTrigger id="regenerate-template">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TEMPLATE_VALUE}>None (default prompt)</SelectItem>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id.toString()}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="regenerate-target-count">Number of test cases (3–30)</Label>
              <Input
                id="regenerate-target-count"
                type="number"
                min={3}
                max={30}
                value={regenerateTargetCount}
                onChange={(e) => setRegenerateTargetCount(Number(e.target.value))}
                disabled={generateMutation.isPending}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => handleRegenerateDialogChange(false)}
              disabled={generateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRegenerate}
              disabled={
                generateMutation.isPending ||
                regenerateTargetCount < 3 ||
                regenerateTargetCount > 30
              }
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Regenerating...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Regenerate
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Feature Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this feature?</DialogTitle>
            <DialogDescription>
              &ldquo;{feature.title}&rdquo; and its {stats.total} test case{stats.total === 1 ? '' : 's'}
              {' '}(plus any links) will be permanently deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleteFeatureMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteFeature}
              disabled={deleteFeatureMutation.isPending}
            >
              {deleteFeatureMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Deleting...</>
              ) : (
                <><Trash2 className="w-4 h-4 mr-2" />Delete Feature</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
