'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Box, LayoutTemplate, AlertTriangle } from 'lucide-react';
import { useDashboardData } from '@/lib/queries';

export default function Dashboard() {
  const { features, templates, isLoading, error } = useDashboardData();

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
            <Plus className="w-4 h-4 mr-2" />
            New Feature
          </Button>
        </Link>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              <p className="text-sm text-destructive">
                Failed to connect to API. Make sure the backend is running.
              </p>
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
              {isLoading ? '—' : features.length}
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
              {isLoading ? '—' : templates.length}
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
                <Plus className="w-4 h-4 mr-2" />
                Create Feature
              </Button>
            </Link>
            <Link href="/templates" className="block">
              <Button variant="outline" className="w-full justify-start">
                <LayoutTemplate className="w-4 h-4 mr-2" />
                View Templates
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Recent Features */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Recent Features</h2>
        {isLoading ? (
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
              <Box className="w-12 h-12 text-muted-foreground mb-4" />
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
                      {feature.description || feature.raw_requirements}
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
