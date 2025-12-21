'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { featureApi, templateApi, generateApi, type Template, type TestCaseDraft } from '@/lib/api';

export default function NewFeaturePage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedCases, setGeneratedCases] = useState<TestCaseDraft[]>([]);
  const [createdFeatureId, setCreatedFeatureId] = useState<number | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [requirements, setRequirements] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  useEffect(() => {
    async function loadTemplates() {
      try {
        const data = await templateApi.list();
        setTemplates(data);
      } catch (err) {
        console.error('Failed to load templates:', err);
      }
    }
    loadTemplates();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !requirements.trim()) {
      setError('Title and requirements are required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Create the feature
      const feature = await featureApi.create({
        title: title.trim(),
        description: description.trim() || undefined,
        raw_requirements: requirements.trim(),
      });

      setCreatedFeatureId(feature.id);

      // Generate test cases
      setGenerating(true);
      const response = await generateApi.generateTestCases({
        feature_id: feature.id,
        template_id: selectedTemplateId ? parseInt(selectedTemplateId) : undefined,
      });

      setGeneratedCases(response.test_cases);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create feature');
    } finally {
      setLoading(false);
      setGenerating(false);
    }
  };

  const handleViewFeature = () => {
    if (createdFeatureId) {
      router.push(`/features/${createdFeatureId}`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create New Feature</h1>
        <p className="text-muted-foreground mt-1">
          Paste your requirements and let AI generate comprehensive test cases.
        </p>
      </div>

      {/* Error Alert */}
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

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Form Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Feature Details
            </CardTitle>
            <CardDescription>
              Enter the feature information and requirements
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Feature Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g., User Authentication"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={loading || generatedCases.length > 0}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  placeholder="Brief description of the feature"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={loading || generatedCases.length > 0}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="template">Generation Template</Label>
                <Select
                  value={selectedTemplateId}
                  onValueChange={setSelectedTemplateId}
                  disabled={loading || generatedCases.length > 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a template (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id.toString()}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Templates customize how AI generates test cases
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="requirements">Requirements *</Label>
                <Textarea
                  id="requirements"
                  placeholder={`Paste your requirements here...

Example:
- Users should be able to log in with email and password
- Password must be at least 8 characters
- Show error message for invalid credentials
- Lock account after 5 failed attempts`}
                  value={requirements}
                  onChange={(e) => setRequirements(e.target.value)}
                  disabled={loading || generatedCases.length > 0}
                  className="min-h-[200px] font-mono text-sm"
                />
              </div>

              {generatedCases.length === 0 ? (
                <Button
                  type="submit"
                  className="w-full glow-teal"
                  disabled={loading || !title.trim() || !requirements.trim()}
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      {generating ? 'Generating Test Cases...' : 'Creating Feature...'}
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Generate Test Cases
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  type="button"
                  className="w-full"
                  onClick={handleViewFeature}
                >
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  View Feature & Curate Test Cases
                </Button>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Generated Test Cases Preview */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Generated Test Cases</h2>
            {generatedCases.length > 0 && (
              <Badge variant="secondary" className="text-primary">
                {generatedCases.length} cases
              </Badge>
            )}
          </div>

          {generatedCases.length === 0 ? (
            <Card className="border-dashed h-[400px] flex items-center justify-center">
              <CardContent className="text-center">
                <svg className="w-16 h-16 text-muted-foreground mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <p className="text-muted-foreground">
                  Test cases will appear here after generation
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
              {generatedCases.map((testCase, index) => (
                <Card
                  key={index}
                  className={`card-hover ${testCase.is_edge_case ? 'edge-case-glow' : ''}`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base font-medium">
                        {testCase.title}
                      </CardTitle>
                      <div className="flex gap-2 shrink-0">
                        {testCase.is_edge_case && (
                          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40">
                            Edge Case
                          </Badge>
                        )}
                        <Badge className="status-draft">Draft</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Steps:</p>
                      <ol className="list-decimal list-inside space-y-1 text-sm">
                        {testCase.steps.map((step, stepIndex) => (
                          <li key={stepIndex} className="text-foreground/80">
                            {step}
                          </li>
                        ))}
                      </ol>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Expected Result:</p>
                      <p className="text-sm text-foreground/80">{testCase.expected_result}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

