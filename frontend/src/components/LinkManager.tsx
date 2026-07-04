'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Link2, 
  Trash2, 
  Plus, 
  ArrowRight, 
  FileText,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { 
  useFeatureLinks, 
  useDeleteFeatureLink,
  useDeleteTestCaseLink,
} from '@/lib/queries';
import { 
  LINK_TYPE_LABELS, 
  type FeatureLink, 
  type TestCaseLink,
  type FeatureLinkType,
} from '@/lib/api';
import { LinkSelectorDialog } from './LinkSelectorDialog';

interface LinkManagerProps {
  featureId: number;
  className?: string;
}

const LINK_TYPE_COLORS: Record<FeatureLinkType, string> = {
  relates_to: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  depends_on: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  blocks: 'bg-red-500/20 text-red-400 border-red-500/30',
  parent_of: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  child_of: 'bg-green-500/20 text-green-400 border-green-500/30',
};

export function LinkManager({ featureId, className }: LinkManagerProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  const { data: linksData, isLoading } = useFeatureLinks(featureId);
  const deleteFeatureLink = useDeleteFeatureLink();
  const deleteTestCaseLink = useDeleteTestCaseLink();
  
  const featureLinks = linksData?.feature_links ?? [];
  const testCaseLinks = linksData?.test_case_links ?? [];
  const totalLinks = featureLinks.length + testCaseLinks.length;

  const handleDeleteFeatureLink = async (link: FeatureLink) => {
    try {
      await deleteFeatureLink.mutateAsync({
        featureId,
        linkId: link.id,
        targetFeatureId: link.target_feature_id,
      });
    } catch (error) {
      console.error('Failed to delete feature link:', error);
    }
  };

  const handleDeleteTestCaseLink = async (link: TestCaseLink) => {
    try {
      await deleteTestCaseLink.mutateAsync({
        featureId,
        linkId: link.id,
      });
    } catch (error) {
      console.error('Failed to delete test case link:', error);
    }
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Link2 className="w-5 h-5" />
              Linked Context
            </CardTitle>
            {totalLinks > 0 && (
              <Badge variant="secondary">{totalLinks}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDialogOpen(true)}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Link
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              aria-expanded={isExpanded}
              aria-label={isExpanded ? 'Collapse linked context' : 'Expand linked context'}
            >
              {isExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : totalLinks === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Link2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No linked context yet</p>
              <p className="text-xs mt-1">
                Link related features or test cases to provide context for AI generation
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Feature Links */}
              {featureLinks.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                    Linked Features
                  </h4>
                  <div className="space-y-2">
                    {featureLinks.map((link) => (
                      <FeatureLinkItem
                        key={link.id}
                        link={link}
                        onDelete={() => handleDeleteFeatureLink(link)}
                        isDeleting={deleteFeatureLink.isPending && deleteFeatureLink.variables?.linkId === link.id}
                      />
                    ))}
                  </div>
                </div>
              )}
              
              {/* Test Case Links */}
              {testCaseLinks.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                    Referenced Test Cases
                  </h4>
                  <div className="space-y-2">
                    {testCaseLinks.map((link) => (
                      <TestCaseLinkItem
                        key={link.id}
                        link={link}
                        onDelete={() => handleDeleteTestCaseLink(link)}
                        isDeleting={deleteTestCaseLink.isPending && deleteTestCaseLink.variables?.linkId === link.id}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      )}
      
      <LinkSelectorDialog
        featureId={featureId}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
      />
    </Card>
  );
}

interface FeatureLinkItemProps {
  link: FeatureLink;
  onDelete: () => void;
  isDeleting: boolean;
}

function FeatureLinkItem({ link, onDelete, isDeleting }: FeatureLinkItemProps) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors group">
      <div className="flex items-center gap-3 min-w-0">
        <Badge 
          variant="outline" 
          className={`shrink-0 ${LINK_TYPE_COLORS[link.link_type]}`}
        >
          {LINK_TYPE_LABELS[link.link_type]}
        </Badge>
        <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <p className="font-medium truncate">
            {link.target_feature_title || `Feature #${link.target_feature_id}`}
          </p>
          {link.notes && (
            <p className="text-xs text-muted-foreground truncate">
              {link.notes}
            </p>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        onClick={onDelete}
        disabled={isDeleting}
        aria-label={`Delete link to ${link.target_feature_title || `feature #${link.target_feature_id}`}`}
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}

interface TestCaseLinkItemProps {
  link: TestCaseLink;
  onDelete: () => void;
  isDeleting: boolean;
}

function TestCaseLinkItem({ link, onDelete, isDeleting }: TestCaseLinkItemProps) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors group">
      <div className="flex items-center gap-3 min-w-0">
        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <p className="font-medium truncate">
            {link.test_case_title || `Test Case #${link.test_case_id}`}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            From: {link.test_case_feature_title || `Feature #${link.test_case_feature_id}`}
          </p>
          {link.notes && (
            <p className="text-xs text-muted-foreground/70 truncate mt-1">
              {link.notes}
            </p>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        onClick={onDelete}
        disabled={isDeleting}
        aria-label={`Remove reference to ${link.test_case_title || `test case #${link.test_case_id}`}`}
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}



