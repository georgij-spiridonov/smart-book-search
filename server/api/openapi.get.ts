import { openApiDocument } from "../utils/openapi/document";

/**
 * GET /api/openapi
 *
 * Возвращает JSON спецификацию OpenAPI 3.1.
 * Она потребляется Scalar UI по адресу /api/docs, а также может быть использована
 * любым инструментом, совместимым с OpenAPI (Postman, Insomnia и т.д.).
 */
export default defineEventHandler(() => {
  return openApiDocument;
});
