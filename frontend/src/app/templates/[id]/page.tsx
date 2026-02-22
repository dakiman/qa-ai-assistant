'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { TemplateForm } from '@/components/TemplateForm';
import { useTemplate } from '@/lib/queries';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, AlertTriangle } from 'lucide-react';

interface EditTemplatePageProps {
  params: Promise<{ id: string }>;
}

export default function EditTemplatePage({ params }: EditTemplatePageProps) {
  const router = useRouter();
  const { id } = use(params);
  const templateId = parseInt(id, 10);
  
  const { data: template, isLoading, error } = useTemplate(templateId);

  const handleBack = () => {
    router.push('/templates');
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
        <p className="text-muted-foreground">Loading template...</p>
      </div>
    );
  }

  // Error state
  if (error || !template) {
    return (
      <div className="max-w-md mx-auto py-20">
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center">
              <AlertTriangle className="w-12 h-12 text-destructive mb-4" />
              <h2 className="text-xl font-semibold mb-2">Template Not Found</h2>
              <p className="text-sm text-muted-foreground mb-6">
                {error?.message || `Template with ID ${id} could not be found.`}
              </p>
              <Button onClick={handleBack} variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Templates
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <TemplateForm template={template} mode="edit" />;
}




