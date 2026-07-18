'use client';

import { QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Toaster } from '@/components/Toaster';
import { toast } from '@/lib/toast';
import { ValidationAPIError } from '@/lib/api';

interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        // Surface every failed mutation to the user instead of silently
        // console.error-ing it (M17). Components may still show inline errors;
        // this is the safety net so no failure goes unreported.
        mutationCache: new MutationCache({
          onError: (error, _variables, _context, mutation) => {
            // Requirements-validation failures are rendered inline by the
            // create/edit forms with their structured issues — don't duplicate.
            if (error instanceof ValidationAPIError) return;
            // Mutations that already render their own inline error (e.g.
            // Add/Edit dialogs, TemplateForm, RefineActionBar) opt out via
            // `meta: { suppressGlobalToast: true }` so the failure isn't
            // surfaced twice (B6).
            if (mutation.meta?.suppressGlobalToast) return;
            toast(
              error instanceof Error ? error.message : 'Something went wrong',
              'error'
            );
          },
        }),
        defaultOptions: {
          queries: {
            // Data is considered fresh for 5 minutes
            staleTime: 5 * 60 * 1000,
            // Cache data for 30 minutes
            gcTime: 30 * 60 * 1000,
            // Retry failed requests once
            retry: 1,
            // Don't refetch on window focus in development
            refetchOnWindowFocus: process.env.NODE_ENV === 'production',
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}




