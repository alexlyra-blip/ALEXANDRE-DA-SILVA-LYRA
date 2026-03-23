import { ref, uploadBytesResumable, uploadBytes, getDownloadURL, StorageReference, UploadTaskSnapshot } from 'firebase/storage';
import { storage } from '@/firebase';

export interface UploadOptions {
  onProgress?: (progress: number) => void;
  timeoutMs?: number;
  useResumable?: boolean;
}

/**
 * Uploads a file to Firebase Storage with progress tracking and timeout.
 * @param path The path in storage where the file will be saved.
 * @param file The file to upload.
 * @param options Optional callbacks and configuration.
 * @returns A promise that resolves to the download URL.
 */
export const uploadFileWithTimeout = async (
  path: string,
  file: File,
  options: UploadOptions = {}
): Promise<string> => {
  const { onProgress, timeoutMs = 90000, useResumable = true } = options;
  console.log(`[StorageService] Starting upload to "${path}" (${file.size} bytes, ${file.type})`);
  
  const storageRef = ref(storage, path);

  // If file is relatively small or useResumable is false, use simple uploadBytes
  // Increased threshold to 1MB for more robust simple uploads
  if (!useResumable || file.size < 1024 * 1024) {
    console.log(`[StorageService] Using simple uploadBytes for "${path}"`);
    
    const performUpload = async (attempt = 1): Promise<string> => {
      const uploadPromise = uploadBytes(storageRef, file);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Timeout no upload do arquivo (${Math.round(timeoutMs / 1000)}s).`)), timeoutMs)
      );

      try {
        await Promise.race([uploadPromise, timeoutPromise]);
        const downloadURL = await getDownloadURL(storageRef);
        console.log(`[StorageService] Simple upload successful for "${path}" (attempt ${attempt}):`, downloadURL);
        return downloadURL;
      } catch (error) {
        if (attempt < 2) {
          console.warn(`[StorageService] Simple upload failed (attempt ${attempt}), retrying...`, error);
          // Wait 1s before retry
          await new Promise(r => setTimeout(r, 1000));
          return performUpload(attempt + 1);
        }
        console.error(`[StorageService] Simple upload error for "${path}" after ${attempt} attempts:`, error);
        throw error;
      }
    };

    return performUpload();
  }

  // Use uploadBytesResumable for larger files or when progress is needed
  console.log(`[StorageService] Using uploadBytesResumable for "${path}"`);
  const uploadTask = uploadBytesResumable(storageRef, file);

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      console.error(`[StorageService] Upload timeout after ${timeoutMs}ms for "${path}"`);
      uploadTask.cancel();
      reject(new Error(`Timeout no upload do arquivo (${Math.round(timeoutMs / 1000)}s). Verifique sua conexão.`));
    }, timeoutMs);

    uploadTask.on(
      'state_changed',
      (snapshot: UploadTaskSnapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        console.log(`[StorageService] Progress for "${path}": ${Math.round(progress)}% (${snapshot.bytesTransferred}/${snapshot.totalBytes})`);
        if (onProgress) {
          onProgress(Math.round(progress));
        }
      },
      (error) => {
        console.error(`[StorageService] Upload error for "${path}":`, error);
        clearTimeout(timeoutId);
        reject(error);
      },
      async () => {
        console.log(`[StorageService] Upload successful for "${path}", getting download URL...`);
        clearTimeout(timeoutId);
        try {
          const downloadURL = await getDownloadURL(storageRef);
          console.log(`[StorageService] Download URL obtained for "${path}":`, downloadURL);
          resolve(downloadURL);
        } catch (error) {
          console.error(`[StorageService] Error getting download URL for "${path}":`, error);
          reject(error);
        }
      }
    );
  });
};

/**
 * Uploads a file using the server-side API route.
 * @param path The path in storage where the file will be saved.
 * @param file The file to upload.
 * @param options Optional callbacks and configuration.
 * @returns A promise that resolves to the download URL.
 */
export const uploadFileViaApi = async (
  path: string,
  file: File,
  options: UploadOptions = {}
): Promise<string> => {
  const { onProgress, timeoutMs = 90000 } = options;
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[StorageService ${requestId}] Starting API upload to "${path}" (${file.size} bytes, ${file.type})`);

  const formData = new FormData();
  formData.append('file', file);
  formData.append('path', path);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.error(`[StorageService ${requestId}] API upload timeout after ${timeoutMs}ms for "${path}"`);
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorData;
      const responseText = await response.text();
      try {
        errorData = JSON.parse(responseText);
      } catch (e) {
        console.error(`[StorageService ${requestId}] API upload failed with status ${response.status} and non-JSON response:`, responseText.substring(0, 200));
        throw new Error(`Erro no servidor (Status ${response.status}). O upload não pôde ser processado.`);
      }
      console.error(`[StorageService ${requestId}] API upload failed with status ${response.status}:`, errorData);
      throw new Error(errorData.error || `Erro no upload: ${response.statusText}`);
    }

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error(`[StorageService ${requestId}] API upload returned success status but invalid JSON:`, responseText.substring(0, 200));
      throw new Error("Resposta inválida do servidor de upload.");
    }
    console.log(`[StorageService ${requestId}] API upload successful for "${path}":`, data.imageUrl);
    
    if (onProgress) onProgress(100);
    
    return data.imageUrl;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.error(`[StorageService ${requestId}] API upload aborted due to timeout`);
      throw new Error(`Timeout no upload do arquivo (${Math.round(timeoutMs / 1000)}s). Verifique sua conexão.`);
    }
    console.error(`[StorageService ${requestId}] API upload error for "${path}":`, error);
    throw error;
  }
};
