import { put } from "@vercel/blob";
import { validateFileType } from "../../utils/fileValidator";
import {
  getFileHash,
  getExistingBlobUrl,
  markFileAsUploaded,
} from "../../utils/hashStore";

/**
 * POST /api/books/upload
 *
 * Accepts a multipart/form-data request with a file field named "file".
 * Validates file type via magic bytes, uploads to Vercel Blob.
 */
export default defineEventHandler(async (event) => {
  try {
    const config = useRuntimeConfig();

    const formData = await readMultipartFormData(event);
    if (!formData || formData.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage:
          "No file provided. Send a 'file' field in multipart form data.",
      });
    }

    const fileField = formData.find((field) => field.name === "file");
    if (!fileField || !fileField.filename || !fileField.data) {
      throw createError({
        statusCode: 400,
        statusMessage: "Missing 'file' field with a valid filename.",
      });
    }

    const allowedExtensions = ["pdf", "txt", "epub"];
    const ext = fileField.filename.split(".").pop()?.toLowerCase();
    if (!ext || !allowedExtensions.includes(ext)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Unsupported file type: .${ext}. Allowed: ${allowedExtensions.join(", ")}`,
      });
    }

    // Validate actual file content via magic bytes
    const validation = validateFileType(fileField.data, ext);
    if (!validation.valid) {
      throw createError({
        statusCode: 400,
        statusMessage: validation.message,
      });
    }

    // Check if the exact same file was already uploaded to save Blob usage
    const hash = getFileHash(fileField.data);
    const existingUrl = getExistingBlobUrl(hash);
    if (existingUrl) {
      return {
        status: "success",
        message: `File "${fileField.filename}" was already uploaded previously.`,
        blob: {
          url: existingUrl,
          pathname: existingUrl.split("/").pop() || fileField.filename,
          contentType: fileField.type || "application/octet-stream",
          size: fileField.data.length,
        },
      };
    }

    // Upload to Vercel Blob under the "books/" folder
    const blob = await put(`books/${fileField.filename}`, fileField.data, {
      access: "public",
      token: config.blobToken,
    });

    // Save hash for future duplicate upload prevention
    markFileAsUploaded(hash, blob.url);

    return {
      status: "success",
      message: `File "${fileField.filename}" uploaded successfully.`,
      blob: {
        url: blob.url,
        pathname: blob.pathname,
        contentType: blob.contentType,
        size: fileField.data.length,
      },
    };
  } catch (error: unknown) {
    if (error && typeof error === "object" && "statusCode" in error)
      throw error;
    throw createError({
      statusCode: 500,
      statusMessage: "Upload failed",
      data: { error: error instanceof Error ? error.message : String(error) },
    });
  }
});
