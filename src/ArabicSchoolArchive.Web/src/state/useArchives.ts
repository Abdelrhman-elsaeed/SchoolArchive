import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApi } from "../api/ApiClientContext";
import { ArchiveService, type ListArchivesQuery } from "../api/ArchiveService";
import type {
  ArchiveDownloadResponse,
  ArchiveItem,
  ArchiveListResponse,
  BatchUploadResponse,
} from "../api/contracts";

export const archiveKeys = {
  all: ["archives"] as const,
  list: (query: ListArchivesQuery) => ["archives", "list", query] as const,
  detail: (id: string) => ["archives", "detail", id] as const,
  download: (id: string) => ["archives", "download", id] as const,
};

function useArchiveService(): ArchiveService {
  const api = useApi();
  return useMemo(() => new ArchiveService(api), [api]);
}

export function useArchiveList(query: ListArchivesQuery) {
  const service = useArchiveService();
  return useQuery<ArchiveListResponse>({
    queryKey: archiveKeys.list(query),
    queryFn: () => service.list(query),
    staleTime: 30_000,
    placeholderData: (previousData) => previousData,
  });
}

export function useArchiveById(documentId: string) {
  const service = useArchiveService();
  return useQuery<ArchiveItem>({
    queryKey: archiveKeys.detail(documentId),
    queryFn: () => service.getById(documentId),
    enabled: documentId.length > 0,
    staleTime: 60_000,
  });
}

export function useArchiveDownloadUrl(documentId: string) {
  const service = useArchiveService();
  return useQuery<ArchiveDownloadResponse>({
    queryKey: archiveKeys.download(documentId),
    queryFn: () => service.getDownloadUrl(documentId),
    enabled: false,
    staleTime: 5 * 60_000,
  });
}

export function useArchiveBatchUpload() {
  const service = useArchiveService();
  const queryClient = useQueryClient();
  return useMutation<BatchUploadResponse, Error, File[]>({
    mutationFn: (files: File[]) => service.uploadBatch(files),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: archiveKeys.all });
    },
  });
}