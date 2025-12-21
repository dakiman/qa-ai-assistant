'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { TestCaseCard } from '@/components/TestCaseCard';
import { AddTestCaseDialog } from '@/components/AddTestCaseDialog';
import { RefineActionBar } from '@/components/RefineActionBar';
import { 
  featureApi, 
  generateApi, 
  type Feature, 
  type TestCase,
  type RefinementResponse 
} from '@/lib/api';

export default function FeatureDetailPage() {
  const params = useParams();
  const featureId = parseInt(params.id as string);
  
  const [feature, setFeature] = useState<Feature | null>(null);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refinementMessage, setRefinementMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [featureData, testCasesData] = await Promise.all([
        featureApi.get(featureId),
        generateApi.getFeatureTestCases(featureId),
      ]);
      setFeature(featureData);
      setTestCases(testCasesData);
    } catch (err) {
      setError('Failed to load feature');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [featureId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleTestCaseStatusChange = (updatedCase: TestCase) => {
    setTestCases(prev => 
      prev.map(tc => tc.id === updatedCase.id ? updatedCase : tc)
    );
  };

  const handleTestCaseAdded = (newCase: TestCase) => {
    setTestCases(prev => [...prev, newCase]);
  };

  const handleRefinementComplete = (response: RefinementResponse) => {
    setTestCases(response.test_cases);
    setRefinementMessage(response.message);
    // Clear message after 5 seconds
    setTimeout(() => setRefinementMessage(null), 5000);
  };

  // Calculate stats
  const stats = {
    total: testCases.length,
    draft: testCases.filter((tc) => tc.status === 'draft').length,
    accepted: testCases.filter((tc) => tc.status === 'accepted').length,
    rejected: testCases.filter((tc) => tc.status === 'rejected').length,
    edgeCases: testCases.filter((tc) => tc.is_edge_case).length,
    manual: testCases.filter((tc) => tc.is_manual).length,
  };

  if (loading) {
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
          <p className="text-destructive mb-4">{error || 'Feature not found'}</p>
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
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-3xl font-bold tracking-tight">{feature.title}</h1>
            <Badge variant="outline">#{feature.id}</Badge>
          </div>
          <p className="text-muted-foreground">
            {feature.description || 'No description provided'}
          </p>
        </div>
        <Button variant="outline" className="shrink-0">
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Edit Feature
        </Button>
      </div>

      {/* Refinement Success Message */}
      {refinementMessage && (
        <Card className="border-green-500/50 bg-green-500/10 animate-in slide-in-from-top-2">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-green-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
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

      {/* Requirements */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Requirements</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap font-mono text-sm bg-muted/50 p-4 rounded-lg">
            {feature.raw_requirements}
          </pre>
        </CardContent>
      </Card>

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

        {testCases.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <svg className="w-12 h-12 text-muted-foreground mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              <p className="text-muted-foreground mb-4">No test cases generated yet</p>
              <AddTestCaseDialog
                featureId={featureId}
                onTestCaseAdded={handleTestCaseAdded}
                trigger={
                  <Button>
                    <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Manual Test Case
                  </Button>
                }
              />
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

      {/* Floating Refine Action Bar */}
      <RefineActionBar
        featureId={featureId}
        testCases={testCases}
        onRefinementComplete={handleRefinementComplete}
      />
    </div>
  );
}
