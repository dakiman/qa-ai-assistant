'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { featureApi, templateApi, type Feature, type Template } from '@/lib/api';

export default function Dashboard() {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [featuresData, templatesData] = await Promise.all([
          featureApi.list(),
          templateApi.list(),
        ]);
        setFeatures(featuresData);
        setTemplates(templatesData);
      } catch (err) {
        setError('Failed to connect to API. Make sure the backend is running.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Welcome to QA-Craft. Start by creating a feature to generate test cases.
          </p>
        </div>
        <Link href="/features/new">
          <Button className="glow-teal">
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Feature
          </Button>
        </Link>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-sm text-destructive">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="card-hover">
          <CardHeader className="pb-2">
            <CardDescription>Total Features</CardDescription>
            <CardTitle className="text-4xl font-bold text-primary">
              {loading ? '—' : features.length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Features with requirements to test
            </p>
          </CardContent>
        </Card>

        <Card className="card-hover">
          <CardHeader className="pb-2">
            <CardDescription>Templates Available</CardDescription>
            <CardTitle className="text-4xl font-bold text-primary">
              {loading ? '—' : templates.length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              AI prompt templates for generation
            </p>
          </CardContent>
        </Card>

        <Card className="card-hover">
          <CardHeader className="pb-2">
            <CardDescription>Quick Actions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link href="/features/new" className="block">
              <Button variant="secondary" className="w-full justify-start">
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Feature
              </Button>
            </Link>
            <Link href="/templates" className="block">
              <Button variant="outline" className="w-full justify-start">
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" />
                </svg>
                View Templates
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Recent Features */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Recent Features</h2>
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-5 w-1/2 bg-muted rounded" />
                  <div className="h-4 w-3/4 bg-muted rounded mt-2" />
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : features.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <svg className="w-12 h-12 text-muted-foreground mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <p className="text-muted-foreground mb-4">No features created yet</p>
              <Link href="/features/new">
                <Button>Create your first feature</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {features.slice(0, 4).map((feature) => (
              <Link key={feature.id} href={`/features/${feature.id}`}>
                <Card className="card-hover cursor-pointer h-full">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{feature.title}</CardTitle>
                      <Badge variant="secondary">
                        #{feature.id}
                      </Badge>
                    </div>
                    <CardDescription className="line-clamp-2">
                      {feature.description || feature.raw_requirements.slice(0, 100)}...
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">
                      Created {new Date(feature.created_at).toLocaleDateString()}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
