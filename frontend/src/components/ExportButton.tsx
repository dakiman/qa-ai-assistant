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
import type { TestCaseStatus } from '@/lib/api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || '';

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
      // Build URL with query params
      const params = new URLSearchParams();
      params.set('format', format);
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }
      
      const url = `${API_BASE_URL}/features/${featureId}/export?${params.toString()}`;
      
      const headers: HeadersInit = {};
      if (API_KEY) {
        headers['X-API-Key'] = API_KEY;
      }
      
      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        throw new Error('Export failed');
      }
      
      // Get filename from Content-Disposition header or generate one
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `feature_${featureId}_test_cases.${format}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) {
          filename = match[1];
        }
      }
      
      // Download the file
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className || ''}`}>
      <Select value={format} onValueChange={(value: ExportFormat) => setFormat(value)}>
        <SelectTrigger className="w-[100px]" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="json">JSON</SelectItem>
          <SelectItem value="csv">CSV</SelectItem>
        </SelectContent>
      </Select>
      
      <Select value={statusFilter} onValueChange={(value: StatusFilter) => setStatusFilter(value)}>
        <SelectTrigger className="w-[120px]" size="sm">
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




