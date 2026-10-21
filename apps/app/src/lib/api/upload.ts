/**
 * Multipart upload with real progress.
 *
 * `fetch` cannot report how much of a request body has been sent, so chat media (which can be
 * tens of megabytes of video) goes through `XMLHttpRequest`, whose upload events can. Same
 * rules as `apiFetch`: Bearer token on native, cookies on web, the API's `{ ok, data | error }`
 * envelope becomes data or an `ApiError`.
 *
 * On native, React Native's own networking reads the file straight from the `file://` URI
 * (`{ uri, name, type }` form part), so a large video is streamed from disk rather than loaded
 * into JavaScript memory first.
 */
import { Platform } from 'react-native';

import { clientEnv } from '@/lib/env';
import { sessionToken } from '@/lib/session/storage';

import { ApiError } from './client';

export interface UploadFile {
  uri: string;
  name: string;
  type: string;
}

export interface UploadHandle<T> {
  promise: Promise<T>;
  /** Stop the upload; the promise rejects with an `ApiError` of code `aborted`. */
  abort: () => void;
}

async function buildForm(file: UploadFile): Promise<FormData> {
  const form = new FormData();
  if (Platform.OS === 'web') {
    const blob = await fetch(file.uri).then((r) => r.blob());
    form.append('file', new File([blob], file.name, { type: blob.type || file.type }));
  } else {
    // React Native's FormData accepts this shape and streams the file from disk.
    form.append('file', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
  }
  return form;
}

export function uploadWithProgress<T>(
  path: string,
  file: UploadFile,
  onProgress?: (fraction: number) => void,
): UploadHandle<T> {
  const xhr = new XMLHttpRequest();
  let aborted = false;

  const promise = (async () => {
    const form = await buildForm(file);
    return new Promise<T>((resolve, reject) => {
      xhr.open('POST', `${clientEnv.apiUrl}${path}`);
      const token = sessionToken.get();
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.withCredentials = true;
      xhr.responseType = 'text';

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) onProgress?.(Math.min(1, e.loaded / e.total));
      };
      xhr.onload = () => {
        let body: {
          ok?: boolean;
          data?: T;
          error?: { code: string; message: string; details?: Record<string, string[]> };
        } | null = null;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          body = null;
        }
        if (xhr.status >= 200 && xhr.status < 300 && body?.ok === true) {
          onProgress?.(1);
          resolve(body.data as T);
          return;
        }
        const err = body && body.ok === false ? body.error : undefined;
        reject(
          new ApiError(
            err?.message ?? `Upload failed (${xhr.status}).`,
            err?.code ?? 'request_failed',
            xhr.status,
            err?.details,
          ),
        );
      };
      xhr.onerror = () =>
        reject(new ApiError('Could not reach the PANDAM API.', 'network_error', 0));
      xhr.ontimeout = () => reject(new ApiError('The upload timed out.', 'network_error', 0));
      xhr.onabort = () => reject(new ApiError('Upload cancelled.', 'aborted', 0));
      xhr.timeout = 5 * 60_000;
      if (aborted) {
        reject(new ApiError('Upload cancelled.', 'aborted', 0));
        return;
      }
      xhr.send(form);
    });
  })();

  return {
    promise,
    abort: () => {
      aborted = true;
      xhr.abort();
    },
  };
}
