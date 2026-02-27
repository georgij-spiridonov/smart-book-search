import { generateText } from "ai";
import { CHAT_CONFIG, type QueryType } from "./chatConfig";
import { log } from "./logger";

const VALID_TYPES: ReadonlySet<string> = new Set<QueryType>([
  "fragment_search",
  "question_answer",
]);

/**
 * Maximum time (ms) to wait for the classifier model before falling back.
 * Classification is a simple one-word response, so 5 s is very generous.
 */
const CLASSIFIER_TIMEOUT_MS = 5_000;

/**
 * Classifies a user query as either a fragment search or a Q&A request.
 *
 * Uses a lightweight model for fast, low-cost classification.
 * Falls back to `question_answer` if the model returns an unexpected value.
 *
 * @param query - The user's raw query text.
 * @returns The classified query type.
 */
export async function classifyQuery(query: string): Promise<QueryType> {
  try {
    const { text } = await generateText({
      model: CHAT_CONFIG.classifierModel,
      system: CHAT_CONFIG.classifierSystemPrompt,
      prompt: query,
      abortSignal: AbortSignal.timeout(CLASSIFIER_TIMEOUT_MS),
    });

    const normalized = text.trim().toLowerCase();

    if (VALID_TYPES.has(normalized)) {
      log.info("classifier", "Query successfully classified", {
        queryType: normalized,
      });
      return normalized as QueryType;
    }

    // Model returned something unexpected — default to Q&A
    log.warn(
      "classifier",
      "Unexpected classifier output, falling back to Q&A",
      { output: text },
    );
    return "question_answer";
  } catch (error) {
    log.error("classifier", "Classification failed, falling back to Q&A", {
      error: error instanceof Error ? error.message : String(error),
    });
    return "question_answer";
  }
}
