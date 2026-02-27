import { inngest } from "../../utils/inngest";
import { createJob, getJob } from "../../utils/jobStore";

/**
 * GET /api/tests/inngest-e2e
 *
 * End-to-End Test for Inngest:
 * 1. Creates a dummy job in Redis.
 * 2. Sends a 'book/vectorize' event with dummy data.
 * 3. Waits for Inngest to pick up and start the job (updates status to 'processing').
 */
export default defineEventHandler(async () => {
  const jobId = `test-e2e-${Date.now()}`;
  const bookName = "Inngest E2E Test Book";

  try {
    const config = useRuntimeConfig();
    // In dev mode, the Inngest client uses isDev: true, so cloud keys are NOT used
    const hasEventKey = !!(
      config.inngestEventKey || process.env.INNGEST_EVENT_KEY
    );
    const isLocalhost = process.env.NODE_ENV !== "production";

    // 1. Create a job to track progress
    await createJob(jobId, bookName);

    // 2. Send event to Inngest
    const sendResult = await inngest.send({
      name: "book/vectorize",
      data: {
        jobId,
        bookId: "test-book-id",
        blobUrl: "https://example.com/non-existent-book.pdf",
        bookName,
        resume: false,
        pineconeApiKey: "dummy",
        pineconeIndex: "dummy",
      },
    });

    if (!sendResult.ids || sendResult.ids.length === 0) {
      throw new Error("Inngest accepted the event but returned no event IDs.");
    }

    // 3. Poll for status change (max 15 seconds)
    let isProcessing = false;
    let finalStatus = "pending";
    let attempts = 0;
    const maxAttempts = 15;

    while (attempts < maxAttempts) {
      const job = await getJob(jobId);
      finalStatus = job?.status || "unknown";

      if (
        finalStatus === "processing" ||
        finalStatus === "failed" ||
        finalStatus === "completed"
      ) {
        isProcessing = true;
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;
    }

    if (!isProcessing) {
      let hint =
        "Check that the serve URL is registered in Inngest Cloud (app.inngest.com → App Settings → App URL → set to https://<your-domain>/api/inngest). Also verify INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY are correct.";
      if (isLocalhost && hasEventKey) {
        hint =
          "CRITICAL: You are using Cloud Event Keys on localhost. Inngest Cloud cannot 'see' your localhost to trigger the function. SOLUTION: Either run 'npx inngest-cli@latest dev' OR use a tunnel (ngrok) and set your Inngest Cloud app URL to that tunnel.";
      } else if (isLocalhost) {
        hint =
          "In local development, ensure Inngest Dev Server is running ('npx inngest-cli@latest dev').";
      }

      return {
        status: "failure",
        message: `Inngest function did not start within 15 seconds. Current status: ${finalStatus}`,
        hint,
      };
    }

    return {
      status: "success",
      message:
        "Inngest E2E trigger successful! Event sent and function execution detected.",
      detail: `Job Status: '${finalStatus}'`,
    };
  } catch (error: unknown) {
    return {
      status: "error",
      message: "Inngest E2E test failed during trigger.",
      error: error instanceof Error ? error.message : String(error),
    };
  }
});
