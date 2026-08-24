/**
 * Cloudinary unsigned upload helpers.
 *
 * Unsigned uploads go directly from the browser to Cloudinary using only the
 * cloud name and an unsigned upload preset — no server secret required.
 */
export type CloudinaryUploadResult = {
  secure_url: string;
  public_id: string;
  url: string;
  [key: string]: unknown;
};

export function getCloudinaryConfig(): { cloudName: string; uploadPreset: string } {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !uploadPreset) {
    throw new Error(
      'Cloudinary is not configured. Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET in your environment.',
    );
  }
  return { cloudName, uploadPreset };
}

export const CLOUDINARY_UPLOAD_URL = (cloudName: string) =>
  `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

/** Upload a single file and resolve its secure Cloudinary URL. */
export async function uploadToCloudinary(file: File): Promise<string> {
  if (!file || !(file instanceof File)) {
    throw new Error('A valid file is required to upload.');
  }
  const { cloudName, uploadPreset } = getCloudinaryConfig();
  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', uploadPreset);

  const response = await fetch(CLOUDINARY_UPLOAD_URL(cloudName), {
    method: 'POST',
    body: form,
  });

  const result = (await response.json().catch(() => ({}))) as {
    secure_url?: string;
    error?: { message?: string };
  };

  if (!response.ok || !result.secure_url) {
    throw new Error(result.error?.message || 'Could not upload image to Cloudinary.');
  }
  return result.secure_url;
}

/** Upload several files and resolve the list of secure Cloudinary URLs. */
export async function uploadFilesToCloudinary(files: File[]): Promise<string[]> {
  return Promise.all(files.map((file) => uploadToCloudinary(file)));
}
