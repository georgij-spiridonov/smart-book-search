import { put } from "@vercel/blob";

/**
 * POST /api/books/upload
 *
 * Accepts a multipart/form-data request with a file field named "file".
 * Uploads the file to Vercel Blob and returns the blob URL + metadata.
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

    const allowedExtensions = ["pdf", "txt"];
    const ext = fileField.filename.split(".").pop()?.toLowerCase();
    if (!ext || !allowedExtensions.includes(ext)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Unsupported file type: .${ext}. Allowed: ${allowedExtensions.join(", ")}`,
      });
    }

    // Upload to Vercel Blob under the "books/" folder
    const blob = await put(`books/${fileField.filename}`, fileField.data, {
      access: "public",
      token: config.blobToken,
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
  } catch (error: any) {
    if (error.statusCode) throw error; // re-throw createError
    throw createError({
      statusCode: 500,
      statusMessage: "Upload failed",
      data: { error: error.message },
    });
  }
});
