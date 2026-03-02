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
 * Принимает запрос multipart/form-data с полем файла "file".
 * Проверяет тип файла через магические байты, загружает в Vercel Blob.
 */
export default defineEventHandler(async (event) => {
  try {
    const applicationConfig = useRuntimeConfig();

    const session = await getUserSession(event);
    const userId = session.user?.id || session.id;

    if (!userId) {
      throw createError({
        statusCode: 401,
        message: "Не авторизован: Сессия не найдена",
      });
    }

    const multipartFormData = await readMultipartFormData(event);
    if (!multipartFormData || multipartFormData.length === 0) {
      log.warn("upload-api", "Upload request rejected: no form data");
      throw createError({
        statusCode: 400,
        message: "Файл не предоставлен. Отправьте поле 'file' в формате multipart form data.",
      });
    }

    const uploadedFileField = multipartFormData.find((field) => field.name === "file");
    if (!uploadedFileField || !uploadedFileField.filename || !uploadedFileField.data) {
      log.warn("upload-api", "Upload request rejected: missing file field");
      throw createError({
        statusCode: 400,
        message: "Отсутствует поле 'file' с правильным именем файла.",
      });
    }

    // Извлекаем опциональные поля метаданных из multipart form
    const bookTitleField = multipartFormData.find((field) => field.name === "title");
    const bookAuthorField = multipartFormData.find((field) => field.name === "author");
    const bookCoverUrlField = multipartFormData.find((field) => field.name === "coverUrl");

    let extractedTitle = bookTitleField?.data?.toString("utf-8")?.trim();
    if (!extractedTitle) {
      extractedTitle = uploadedFileField.filename.replace(/\.[^/.]+$/, "");
    }
    const extractedAuthor = bookAuthorField?.data?.toString("utf-8")?.trim() || "Unknown";
    const extractedCoverUrl = bookCoverUrlField?.data?.toString("utf-8")?.trim() || "";

    const allowedFileExtensions = ["pdf", "txt", "epub"];
    const fileExtension = uploadedFileField.filename.split(".").pop()?.toLowerCase();

    log.info("upload-api", "Processing file upload", {
      filename: uploadedFileField.filename,
      sizeBytes: uploadedFileField.data.length,
      extension: fileExtension,
      userId,
    });

    if (!fileExtension || !allowedFileExtensions.includes(fileExtension)) {
      log.warn("upload-api", "Upload rejected: unsupported extension", { fileExtension });
      throw createError({
        statusCode: 400,
        message: `Неподдерживаемый тип файла: .${fileExtension}. Разрешены: ${allowedFileExtensions.join(", ")}`,
      });
    }

    // Проверяем фактическое содержимое файла через магические байты
    const fileValidationResult = validateFileType(uploadedFileField.data, fileExtension);
    if (!fileValidationResult.valid) {
      log.warn("upload-api", "Upload rejected: magic byte validation failed", {
        reason: fileValidationResult.message,
      });
      throw createError({
        statusCode: 400,
        message: fileValidationResult.message, // Валидатор возвращает русские сообщения
      });
    }

    // Проверяем, был ли этот же файл уже загружен, чтобы сэкономить хранилище Blob
    const fileContentHash = getFileHash(uploadedFileField.data);
    const existingBlobUrl = await getExistingBlobUrl(fileContentHash);
    
    if (existingBlobUrl) {
      log.info("upload-api", "File duplicate detected, skipping blob upload", {
        hash: fileContentHash,
        existingUrl: existingBlobUrl,
      });
      
      // Все равно регистрируем в хранилище книг, если его там еще нет
      const generatedBookId = slugifyBookId(extractedTitle);
      const existingBookRecord = await getBook(generatedBookId);
      
      if (!existingBookRecord) {
        await addBook({
          id: generatedBookId,
          userId,
          title: extractedTitle,
          author: extractedAuthor,
          coverUrl: extractedCoverUrl,
          blobUrl: existingBlobUrl,
          filename: uploadedFileField.filename,
          fileSize: uploadedFileField.data.length,
          uploadedAt: Date.now(),
          vectorized: false,
        });
      }

      return {
        status: "success",
        message: `Файл "${uploadedFileField.filename}" уже был загружен ранее.`,
        blob: {
          url: existingBlobUrl,
          pathname: existingBlobUrl.split("/").pop() || uploadedFileField.filename,
          contentType: uploadedFileField.type || "application/octet-stream",
          size: uploadedFileField.data.length,
        },
      };
    }

    // Загружаем в Vercel Blob в папку "books/"
    const uploadedBlobInfo = await put(`books/${uploadedFileField.filename}`, uploadedFileField.data, {
      access: "public",
      token: applicationConfig.blobToken,
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    log.info("upload-api", "File uploaded to Vercel Blob successfully", {
      blobUrl: uploadedBlobInfo.url,
      pathname: uploadedBlobInfo.pathname,
    });

    // Сохраняем хэш для предотвращения дублирования загрузок в будущем
    await markFileAsUploaded(fileContentHash, uploadedBlobInfo.url);

    // Регистрируем книгу в постоянном хранилище KV
    const finalBookId = slugifyBookId(extractedTitle);
    await addBook({
      id: finalBookId,
      userId,
      title: extractedTitle,
      author: extractedAuthor,
      coverUrl: extractedCoverUrl,
      blobUrl: uploadedBlobInfo.url,
      filename: uploadedFileField.filename,
      fileSize: uploadedFileField.data.length,
      uploadedAt: Date.now(),
      vectorized: false,
    });

    return {
      status: "success",
      message: `Файл "${uploadedFileField.filename}" успешно загружен.`,
      blob: {
        url: uploadedBlobInfo.url,
        pathname: uploadedBlobInfo.pathname,
        contentType: uploadedBlobInfo.contentType,
        size: uploadedFileField.data.length,
      },
    };
  } catch (uploadError: unknown) {
    if (uploadError && typeof uploadError === "object" && "statusCode" in uploadError)
      throw uploadError;

    log.error("upload-api", "Unhandled error during array upload", {
      error: uploadError instanceof Error ? uploadError.message : String(uploadError),
      stack: uploadError instanceof Error ? uploadError.stack : undefined,
    });

    throw createError({
      statusCode: 500,
      message: "Ошибка загрузки",
      data: { error: uploadError instanceof Error ? uploadError.message : String(uploadError) },
    });
  }
});
