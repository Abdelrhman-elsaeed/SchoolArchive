export type UploadStatus = "Success" | "Rejected" | "Failed" | "Pending";

export interface SingleFileUploadResponse {
  originalName: string;
  status: UploadStatus;
  reasonCode: string | null;
  message: string;
  documentId: string | null;
  category: string | null;
  sizeBytes: number | null;
  mimeType: string | null;
  blobUri: string | null;
}

export interface BatchUploadResponse {
  totalFiles: number;
  successfulFiles: number;
  failedFiles: number;
  results: SingleFileUploadResponse[];
}

export interface ArchiveItem {
  documentId: string;
  schoolId: string;
  originalName: string;
  safeName: string;
  blobObjectName: string;
  sizeBytes: number;
  mimeType: string;
  category: string | null;
  displayName: string | null;
  summary: string | null;
  tags: string[];
  confidence: number | null;
  needsReview: boolean;
  uploadedByUserId: string;
  uploadedAtUtc: string;
  processingYear: number;
  processingMonth: number;
}

export interface ArchiveListResponse {
  items: ArchiveItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface ArchiveDownloadResponse {
  documentId: string;
  blobObjectName: string;
  signedUrl: string;
  expiresAtUtc: string;
  ttlMinutes: number;
}

export interface ErrorResponse {
  code: string;
  state?: string;
  requestId?: string;
}
