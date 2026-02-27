import { put } from "@vercel/blob";
import { validateFileType } from "../../utils/fileValidator";
import {
  getFileHash,
  getExistingBlobUrl,
  markFileAsUploaded,
} from "../../utils/hashStore";
import { addBook, getBook, slugifyBookId } from "../../utils/bookStore";

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

    // Extract optional metadata fields from multipart form
    const authorField = formData.find((field) => field.name === "author");
    const coverUrlField = formData.find((field) => field.name === "coverUrl");
    const author = authorField?.data?.toString("utf-8")?.trim() || "Unknown";
    const coverUrl = coverUrlField?.data?.toString("utf-8")?.trim() || "";

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
    const existingUrl = await getExistingBlobUrl(hash);
    if (existingUrl) {
      // Still register in book store if not already there
      const bookTitle = fileField.filename.replace(/\.[^/.]+$/, "");
      const bookId = slugifyBookId(bookTitle);
      const existingBook = await getBook(bookId);
      if (!existingBook) {
        await addBook({
          id: bookId,
          title: bookTitle,
          author,
          coverUrl,
          blobUrl: existingUrl,
          filename: fileField.filename,
          fileSize: fileField.data.length,
          uploadedAt: Date.now(),
          vectorized: false,
        });
      }

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
    await markFileAsUploaded(hash, blob.url);

    // Register book in the persistent KV store
    const bookTitle = fileField.filename.replace(/\.[^/.]+$/, "");
    const bookId = slugifyBookId(bookTitle);
    await addBook({
      id: bookId,
      title: bookTitle,
      author,
      coverUrl,
      blobUrl: blob.url,
      filename: fileField.filename,
      fileSize: fileField.data.length,
      uploadedAt: Date.now(),
      vectorized: false,
    });

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
