import type { ApiClient } from "./ApiClient";
import type {
  ArchiveDownloadResponse,
  ArchiveItem,
  ArchiveListResponse,
  BatchUploadResponse,
} from "./contracts";

export interface ListArchivesQuery {
  page?: number;
  pageSize?: number;
  originalNameContains?: string;
  category?: string;
  uploadedFrom?: string;
  uploadedTo?: string;
  processingYear?: number;
  processingMonth?: number;
}

export class ArchiveService {
  constructor(private readonly api: ApiClient) {}

  async uploadBatch(files: File[]): Promise<BatchUploadResponse> {
    if (files.length === 0) {
      throw new Error("EMPTY_BATCH");
    }
    const form = new FormData();
    for (const file of files) {
      form.append("files", file, file.name);
    }
    return this.api.postForm<BatchUploadResponse>("/api/v1/archive/upload", form);
  }

  /**
   * Upload a single file. Used by the queue runner so we can show
   * per-file lifecycle transitions (uploading → processing → done).
   * The backend accepts the same multipart form; the server handles
   * single-file batches identically to multi-file ones.
   */
  async uploadOne(file: File): Promise<BatchUploadResponse> {
    return this.uploadBatch([file]);
  }

  async list(query: ListArchivesQuery): Promise<ArchiveListResponse> {
    return this.api.get<ArchiveListResponse>("/api/v1/archive/archives", {
      page: query.page,
      pageSize: query.pageSize,
      originalNameContains: query.originalNameContains,
      category: query.category,
      uploadedFrom: query.uploadedFrom,
      uploadedTo: query.uploadedTo,
      processingYear: query.processingYear,
      processingMonth: query.processingMonth,
    });
  }

  async getById(documentId: string): Promise<ArchiveItem> {
    return this.api.get<ArchiveItem>(`/api/v1/archive/archives/${documentId}`);
  }

  async getDownloadUrl(documentId: string): Promise<ArchiveDownloadResponse> {
    return this.api.get<ArchiveDownloadResponse>(
      `/api/v1/archive/archives/${documentId}/download`
    );
  }
}
