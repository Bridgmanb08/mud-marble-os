import { api } from '../api/client';
import type { ProjectFile, RentalFile, SubcontractorFile, UploadUrlResponse } from '../types';

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export function inferFileType(mime: string): 'photo' | 'video' | 'plan' | 'other' {
  if (mime.startsWith('image/')) return 'photo';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/pdf') return 'plan';
  return 'other';
}

async function putToSignedUrl(uploadUrl: string, file: File): Promise<void> {
  const form = new FormData();
  form.append('file', file);
  const headers: Record<string, string> = {};
  if (SUPABASE_ANON_KEY) {
    headers.apikey = SUPABASE_ANON_KEY;
    headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
  }
  const res = await fetch(uploadUrl, { method: 'PUT', headers, body: form });
  if (!res.ok) throw new Error('File upload failed');
}

export async function uploadProjectFile(
  projectId: string,
  file: File,
  taskIds: string[] = [],
  subitemIds: string[] = []
): Promise<ProjectFile> {
  const fileType = inferFileType(file.type);
  const { upload_url, storage_path } = await api.post<UploadUrlResponse>(
    `/projects/${projectId}/files/upload-url`,
    { file_name: file.name, file_type: fileType, mime_type: file.type || null }
  );
  await putToSignedUrl(upload_url, file);
  return api.post<ProjectFile>(`/projects/${projectId}/files`, {
    file_name: file.name,
    file_type: fileType,
    mime_type: file.type || null,
    size_bytes: file.size,
    storage_path,
    task_ids: taskIds,
    subitem_ids: subitemIds,
  });
}

// Always tagged 'signed_estimate' regardless of mime type (a signed
// proposal might come back as a PDF or a photographed signature page) --
// same "always this one type" pattern as uploadRentalFile's lease docs,
// rather than the mime-inferred photo/video/plan/other categorization
// every other project file gets.
export async function uploadSignedEstimateFile(projectId: string, file: File): Promise<ProjectFile> {
  const { upload_url, storage_path } = await api.post<UploadUrlResponse>(
    `/projects/${projectId}/files/upload-url`,
    { file_name: file.name, file_type: 'signed_estimate', mime_type: file.type || null }
  );
  await putToSignedUrl(upload_url, file);
  return api.post<ProjectFile>(`/projects/${projectId}/files`, {
    file_name: file.name,
    file_type: 'signed_estimate',
    mime_type: file.type || null,
    size_bytes: file.size,
    storage_path,
  });
}

export async function uploadSubcontractorFile(subId: string, file: File): Promise<SubcontractorFile> {
  const fileType = inferFileType(file.type);
  const { upload_url, storage_path } = await api.post<UploadUrlResponse>(
    `/subcontractors/${subId}/files/upload-url`,
    { file_name: file.name, file_type: fileType, mime_type: file.type || null }
  );
  await putToSignedUrl(upload_url, file);
  return api.post<SubcontractorFile>(`/subcontractors/${subId}/files`, {
    file_name: file.name,
    file_type: fileType,
    mime_type: file.type || null,
    size_bytes: file.size,
    storage_path,
  });
}

export async function uploadRentalFile(leaseId: string, file: File): Promise<RentalFile> {
  const { upload_url, storage_path } = await api.post<UploadUrlResponse>('/rental-files/upload-url', {
    file_name: file.name,
    file_type: 'lease',
    mime_type: file.type || null,
  });
  await putToSignedUrl(upload_url, file);
  return api.post<RentalFile>('/rental-files', {
    lease_id: leaseId,
    file_name: file.name,
    file_type: 'lease',
    mime_type: file.type || null,
    size_bytes: file.size,
    storage_path,
  });
}

// Photos/video attached to a specific property visit -- reuses the same
// rental-files bucket/upload flow as lease documents, just tagged with
// visit_id instead of lease_id.
export async function uploadRentalVisitFile(visitId: string, file: File): Promise<RentalFile> {
  const fileType = inferFileType(file.type);
  const { upload_url, storage_path } = await api.post<UploadUrlResponse>('/rental-files/upload-url', {
    file_name: file.name,
    file_type: fileType,
    mime_type: file.type || null,
  });
  await putToSignedUrl(upload_url, file);
  return api.post<RentalFile>('/rental-files', {
    visit_id: visitId,
    file_name: file.name,
    file_type: fileType,
    mime_type: file.type || null,
    size_bytes: file.size,
    storage_path,
  });
}

export function fmtBytes(n: number | null): string {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
