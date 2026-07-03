'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Box, ChevronRight } from 'lucide-react';
import { useFeatures } from '@/lib/queries';

export default function FeaturesPage() {
  const { data: features = [], isLoading, error } = useFeatures();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Features</h1>
          <p className="text-muted-foreground mt-1">
            Manage your features and their test cases.
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
            <p className="text-sm text-destructive">Failed to load features</p>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-5 w-2/3 bg-muted rounded" />
                <div className="h-4 w-full bg-muted rounded mt-2" />
              </CardHeader>
              <CardContent>
                <div className="h-4 w-1/3 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : features.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Box className="w-16 h-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No features yet</h3>
            <p className="text-muted-foreground mb-6 text-center max-w-sm">
              Create your first feature to start generating AI-powered test cases.
            </p>
            <Link href="/features/new">
              <Button>Create Feature</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Link key={feature.id} href={`/features/${feature.id}`}>
              <Card className="card-hover cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg line-clamp-1">{feature.title}</CardTitle>
                    <Badge variant="outline" className="shrink-0">
                      #{feature.id}
                    </Badge>
                  </div>
                  <CardDescription className="line-clamp-2">
                    {feature.description || feature.raw_requirements}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Created {new Date(feature.created_at).toLocaleDateString()}</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
