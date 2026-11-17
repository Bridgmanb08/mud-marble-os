import { api } from '../api/client';
import type { ProjectFile, RentalFile, SubcontractorFile, UploadUrlResponse, WorkOrderMedia } from '../types';

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const SPREADSHEET_MIME_TYPES = new Set([
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'text/csv',
]);
const SPREADSHEET_EXTENSIONS = /\.(xls|xlsx|xlsm|csv)$/i;

export function inferFileType(mime: string, fileName?: string): 'photo' | 'video' | 'plan' | 'document' | 'other' {
  if (mime.startsWith('image/')) return 'photo';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/pdf') return 'plan';
  // Browsers sometimes send a blank/generic mime type for .xls uploads --
  // fall back to the file extension so spreadsheets still land in the
  // right category instead of the catch-all "Other" bucket.
  if (SPREADSHEET_MIME_TYPES.has(mime) || (fileName && SPREADSHEET_EXTENSIONS.test(fileName))) return 'document';
  return 'other';
}

export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;

export function mediaTooLargeMessage(file: File): string {
  const mb = file.size / (1024 * 1024);
  return `${file.name} is ${mb.toFixed(0)} MB. Files over 50 MB can't be uploaded. Try a shorter video or a smaller photo.`;
}

export function assertMediaSize(file: File): void {
  if (file.size > MAX_MEDIA_BYTES) throw new Error(mediaTooLargeMessage(file));
}

/** URL inside a macOS .webloc plist, which is what a dragged link becomes. */
export async function readWeblocUrl(file: File): Promise<string | null> {
  if (!file.name.toLowerCase().endsWith('.webloc')) return null;
  const text = await file.text();
  const match = text.match(/<key>\s*URL\s*<\/key>\s*<string>([^<]+)<\/string>/i);
  if (!match) return null;
  const url = match[1].replace(/&amp;/g, '&').trim();
  return url.startsWith('http://') || url.startsWith('https://') ? url : null;
}

export function extractUrls(text: string): string[] {
  const found: string[] = [];
  for (const raw of text.match(/https?:\/\/[^\s<>"']+/gi) || []) {
    const url = raw.replace(/[.,);]+$/, '');
    if (!found.includes(url)) found.push(url);
  }
  return found;
}

function putToSignedUrl(uploadUrl: string, file: File, onProgress?: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    if (SUPABASE_ANON_KEY) {
      xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
      xhr.setRequestHeader('Authorization', `Bearer ${SUPABASE_ANON_KEY}`);
    }
    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable || event.total <= 0) return;
      onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error('File upload failed'));
    };
    xhr.onerror = () => reject(new Error('File upload failed'));
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}

export async function uploadProjectFile(
  projectId: string,
  file: File,
  taskIds: string[] = [],
  subitemIds: string[] = []
): Promise<ProjectFile> {
  const fileType = inferFileType(file.type, file.name);
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
  const fileType = inferFileType(file.type, file.name);
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
  assertMediaSize(file);
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

// A lease document dropped into the New lease form, before the lease exists:
// stored against the property so it's saved the instant it lands, then moved
// onto the lease (attachRentalFileToLease) when the lease is saved.
export async function uploadRentalPropertyFile(propertyId: string, file: File): Promise<RentalFile> {
  assertMediaSize(file);
  const { upload_url, storage_path } = await api.post<UploadUrlResponse>('/rental-files/upload-url', {
    file_name: file.name,
    file_type: 'lease',
    mime_type: file.type || null,
  });
  await putToSignedUrl(upload_url, file);
  return api.post<RentalFile>('/rental-files', {
    property_id: propertyId,
    file_name: file.name,
    file_type: 'lease',
    mime_type: file.type || null,
    size_bytes: file.size,
    storage_path,
  });
}

export function attachRentalFileToLease(fileId: string, leaseId: string): Promise<RentalFile> {
  return api.patch<RentalFile>(`/rental-files/${fileId}`, { lease_id: leaseId });
}

// Photos/video attached to a specific property visit -- reuses the same
// rental-files bucket/upload flow as lease documents, just tagged with
// visit_id instead of lease_id.
export async function uploadRentalVisitFile(
  visitId: string,
  file: File,
  propertyId?: string,
  onProgress?: (pct: number) => void
): Promise<RentalFile> {
  assertMediaSize(file);
  const webloc = await readWeblocUrl(file);
  if (webloc) {
    try {
      return await api.post<RentalFile>('/rental-files/link', {
        visit_id: visitId,
        property_id: propertyId || null,
        link_url: webloc,
      });
    } catch {
      // Keep the shortcut file if the link column isn't available yet.
      // Opening the visit still reads the URL out of the plist.
    }
  }
  const fileType = inferFileType(file.type, file.name);
  const { upload_url, storage_path } = await api.post<UploadUrlResponse>('/rental-files/upload-url', {
    file_name: file.name,
    file_type: fileType,
    mime_type: file.type || null,
  });
  await putToSignedUrl(upload_url, file, onProgress);
  return api.post<RentalFile>('/rental-files', {
    visit_id: visitId,
    property_id: propertyId || null,
    file_name: file.name,
    file_type: fileType,
    mime_type: file.type || null,
    size_bytes: file.size,
    storage_path,
  });
}

export async function saveRentalLink(body: {
  visit_id?: string;
  property_id?: string;
  lease_id?: string;
  link_url: string;
}): Promise<RentalFile> {
  return api.post<RentalFile>('/rental-files/link', body);
}

export async function uploadWorkOrderMedia(
  workOrderId: string,
  file: File,
  opts: { updateId?: string; updateText?: string; onProgress?: (pct: number) => void } = {}
): Promise<WorkOrderMedia> {
  assertMediaSize(file);
  const webloc = await readWeblocUrl(file);
  if (webloc) {
    throw new Error('That file is a link shortcut. Paste the link instead of uploading it.');
  }
  const { upload_url, storage_path } = await api.post<UploadUrlResponse>(
    `/rental-work-orders/${workOrderId}/media/upload-url`,
    { file_name: file.name, mime_type: file.type || null, size_bytes: file.size }
  );
  await putToSignedUrl(upload_url, file, opts.onProgress);
  return api.post<WorkOrderMedia>(`/rental-work-orders/${workOrderId}/media`, {
    storage_path,
    file_name: file.name,
    mime_type: file.type || null,
    size_bytes: file.size,
    update_id: opts.updateId || null,
    update_text: opts.updateText ?? null,
  });
}

export function fmtBytes(n: number | null): string {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
