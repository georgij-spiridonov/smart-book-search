import { put } from "@vercel/blob";
import { validateFileType } from "../../utils/fileValidator";
import {
  getFileHash,
  getExistingBlobUrl,
  markFileAsUploaded,
} from "../../utils/hashStore";
import { addBook, getBook, slugifyBookId } from "../../utils/bookStore";
import { log } from "../../utils/logger";

/**
 * POST /api/books/upload
 *
 * Accepts a multipart/form-data request with a file field named "file".
 * Validates file type via magic bytes, uploads to Vercel Blob.
 */
export default defineEventHandler(async (event) => {
  try {
    const config = useRuntimeConfig();

    const session = await getUserSession(event);
    const userId = session.user?.id || session.id;

    if (!userId) {
      throw createError({
        statusCode: 401,
        statusMessage: "Unauthorized: Session not found",
      });
    }

    const formData = await readMultipartFormData(event);
    if (!formData || formData.length === 0) {
      log.warn("upload-api", "Upload request rejected: no form data");
      throw createError({
        statusCode: 400,
        statusMessage:
          "No file provided. Send a 'file' field in multipart form data.",
      });
    }

    const fileField = formData.find((field) => field.name === "file");
    if (!fileField || !fileField.filename || !fileField.data) {
      log.warn("upload-api", "Upload request rejected: missing file field");
      throw createError({
        statusCode: 400,
        statusMessage: "Missing 'file' field with a valid filename.",
      });
    }

    // Extract optional metadata fields from multipart form
    const titleField = formData.find((field) => field.name === "title");
    const authorField = formData.find((field) => field.name === "author");
    const coverUrlField = formData.find((field) => field.name === "coverUrl");

    let title = titleField?.data?.toString("utf-8")?.trim();
    if (!title) {
      title = fileField.filename.replace(/\.[^/.]+$/, "");
    }
    const author = authorField?.data?.toString("utf-8")?.trim() || "Unknown";
    const coverUrl = coverUrlField?.data?.toString("utf-8")?.trim() || "";

    const allowedExtensions = ["pdf", "txt", "epub"];
    const ext = fileField.filename.split(".").pop()?.toLowerCase();

    log.info("upload-api", "Processing file upload", {
      filename: fileField.filename,
      sizeBytes: fileField.data.length,
      extension: ext,
      userId,
    });

    if (!ext || !allowedExtensions.includes(ext)) {
      log.warn("upload-api", "Upload rejected: unsupported extension", { ext });
      throw createError({
        statusCode: 400,
        statusMessage: `Unsupported file type: .${ext}. Allowed: ${allowedExtensions.join(", ")}`,
      });
    }

    // Validate actual file content via magic bytes
    const validation = validateFileType(fileField.data, ext);
    if (!validation.valid) {
      log.warn("upload-api", "Upload rejected: magic byte validation failed", {
        reason: validation.message,
      });
      throw createError({
        statusCode: 400,
        statusMessage: validation.message,
      });
    }

    // Check if the exact same file was already uploaded to save Blob usage
    const hash = getFileHash(fileField.data);
    const existingUrl = await getExistingBlobUrl(hash);
    if (existingUrl) {
      log.info("upload-api", "File duplicate detected, skipping blob upload", {
        hash,
        existingUrl,
      });
      // Still register in book store if not already there
      const bookTitle = title;
      const bookId = slugifyBookId(bookTitle);
      const existingBook = await getBook(bookId);
      if (!existingBook) {
        await addBook({
          id: bookId,
          userId,
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
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    log.info("upload-api", "File uploaded to Vercel Blob successfully", {
      blobUrl: blob.url,
      pathname: blob.pathname,
    });

    // Save hash for future duplicate upload prevention
    await markFileAsUploaded(hash, blob.url);

    // Register book in the persistent KV store
    const bookTitle = title;
    const bookId = slugifyBookId(bookTitle);
    await addBook({
      id: bookId,
      userId,
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

    log.error("upload-api", "Unhandled error during array upload", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    throw createError({
      statusCode: 500,
      statusMessage: "Upload failed",
      data: { error: error instanceof Error ? error.message : String(error) },
    });
  }
});
