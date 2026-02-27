/**
 * GET /api/docs
 *
 * Serves Scalar API Reference UI — an interactive OpenAPI documentation viewer.
 * Loads the spec dynamically from /api/openapi.
 */
export default defineEventHandler((event) => {
  setResponseHeader(event, "Content-Type", "text/html; charset=utf-8");

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>📚 Smart Book Search — API Docs</title>
  <style>
    body { margin: 0; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  <script>
    Scalar.createApiReference('#app', {
      url: '/api/openapi',
      theme: 'kepler',
      layout: 'modern',
      showSidebar: true,
      hideClientButton: true,
      hideModels: true,
      theme: "kepler",
      telemetry: false,
      documentDownloadType: "both"
    })
  </script>
</body>
</html>`;
});
