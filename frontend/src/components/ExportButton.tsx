'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download, Loader2 } from 'lucide-react';
import { featureApi, type TestCaseStatus } from '@/lib/api';
import { toast } from '@/lib/toast';

type ExportFormat = 'json' | 'csv';
type StatusFilter = 'all' | TestCaseStatus;

interface ExportButtonProps {
  featureId: number;
  className?: string;
}

export function ExportButton({ featureId, className }: ExportButtonProps) {
  const [format, setFormat] = useState<ExportFormat>('json');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);

    try {
      const { blob, filename } = await featureApi.export(
        featureId,
        format,
        statusFilter === 'all' ? undefined : statusFilter,
      );

      // Trigger the browser download
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      // Export isn't a TanStack mutation, so the global handler doesn't cover it —
      // report it explicitly (M17).
      toast(error instanceof Error ? error.message : 'Export failed', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className || ''}`}>
      <Select value={format} onValueChange={(value: ExportFormat) => setFormat(value)}>
        <SelectTrigger className="w-[100px]" size="sm" aria-label="Export format">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="json">JSON</SelectItem>
          <SelectItem value="csv">CSV</SelectItem>
        </SelectContent>
      </Select>
      
      <Select value={statusFilter} onValueChange={(value: StatusFilter) => setStatusFilter(value)}>
        <SelectTrigger className="w-[120px]" size="sm" aria-label="Filter by status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="draft">Draft</SelectItem>
          <SelectItem value="accepted">Accepted</SelectItem>
          <SelectItem value="rejected">Rejected</SelectItem>
        </SelectContent>
      </Select>
      
      <Button 
        variant="outline" 
        size="sm" 
        onClick={handleExport}
        disabled={isExporting}
      >
        {isExporting ? (
          <>
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            Exporting...
          </>
        ) : (
          <>
            <Download className="w-4 h-4 mr-1" />
            Export
          </>
        )}
      </Button>
    </div>
  );
}




