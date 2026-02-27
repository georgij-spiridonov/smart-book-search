import { openApiDocument } from "../utils/openapi/document";

/**
 * GET /api/openapi
 *
 * Returns the OpenAPI 3.1 JSON specification.
 * This is consumed by Scalar UI at /api/docs and can also be used
 * by any OpenAPI-compatible tool (Postman, Insomnia, etc.).
 */
export default defineEventHandler(() => {
  return openApiDocument;
});
