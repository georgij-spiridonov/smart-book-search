import { del } from "@vercel/blob";
import { Pinecone } from "@pinecone-database/pinecone";
import { getBook, deleteBook } from "../../utils/bookStore";
import { deleteHashesByBlobUrl } from "../../utils/hashStore";
import { log } from "../../utils/logger";
import { publishEvent } from "../../utils/events";

/**
 * DELETE /api/books/[id]
 *
 * Performs a "nuclear" deletion of a book:
 * 1. Deletes vectorized chunks from Pinecone.
 * 2. Deletes the original file from Vercel Blob.
 * 3. Deletes the book record and indexes from Upstash Redis.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = session.user?.id || session.id;

  const config = useRuntimeConfig();
  const rawId = getRouterParam(event, "id");
  const id = rawId ? decodeURIComponent(rawId) : undefined;

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Book ID is required",
    });
  }

  const book = await getBook(id);
  if (!book) {
    throw createError({
      statusCode: 404,
      statusMessage: "Book not found",
    });
  }

  try {
    // 1. Delete from Pinecone
    if (config.pineconeApiKey && config.pineconeIndex) {
      try {
        const pc = new Pinecone({ apiKey: config.pineconeApiKey });
        const index = pc.index(config.pineconeIndex);
        await index.deleteMany({ filter: { bookId: id } });
        log.info("delete-api", "Deleted vectors from Pinecone", { bookId: id });
      } catch (err) {
        log.error("delete-api", "Failed to delete vectors from Pinecone", {
          err: err instanceof Error ? err.message : String(err),
        });
        // We log the error but proceed with blob and db deletion
      }
    }

    // 2. Delete from Vercel Blob and Hashes
    if (book.blobUrl) {
      try {
        await del(book.blobUrl, { token: config.blobToken });
        log.info("delete-api", "Deleted file from Vercel Blob", {
          blobUrl: book.blobUrl,
        });

        // Remove known hashes for this blob url
        await deleteHashesByBlobUrl(book.blobUrl);
      } catch (err) {
        log.error("delete-api", "Failed to delete file from Blob", {
          err: err instanceof Error ? err.message : String(err),
        });
        // Proceed with db deletion
      }
    }

    // 3. Delete from Redis Store
    await deleteBook(id);

    // Notify client about book deletion
    if (userId) {
      await publishEvent(userId, "book:updated", {
        bookId: id,
        status: "deleted",
      });
    }

    return {
      status: "success",
      message: `Book "${book.title}" was completely deleted.`,
    };
  } catch (error: unknown) {
    log.error("delete-api", "Nuclear deletion ran into an unexpected error", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw createError({
      statusCode: 500,
      statusMessage: "Nuclear deletion failed",
      data: { error: error instanceof Error ? error.message : String(error) },
    });
  }
});
