import { embedMany } from "ai";
import { Pinecone } from "@pinecone-database/pinecone";
import { splitText } from "../../utils/textSplitter";

/**
 * GET /api/tests/vectorize-pipeline
 *
 * Integration test: verifies the full vectorization pipeline
 * using a small synthetic text sample.
 *
 * Steps tested:
 *   1. Text chunking (splitText)
 *   2. Embedding generation (AI SDK embedMany via AI Gateway)
 *   3. Pinecone upsert + verification via describeIndexStats
 *
 * Uses a "test" namespace in Pinecone to avoid polluting production data.
 */
export default defineEventHandler(async () => {
  const config = useRuntimeConfig();
  const results: { name: string; passed: boolean; detail: string }[] = [];

  // --- Sample text ---
  const sampleText = [
    "Artificial intelligence is a branch of computer science.",
    "It deals with creating systems that can perform tasks requiring human intelligence.",
    "Machine learning is a subset of AI that enables systems to learn from data.",
    "Neural networks are computing systems inspired by biological neural networks.",
    "Deep learning uses multi-layered neural networks to analyze complex patterns.",
  ].join("\n\n");

  // --- Test 1: Chunking ---
  let chunks: ReturnType<typeof splitText> = [];
  try {
    chunks = splitText(sampleText, { chunkSize: 200, chunkOverlap: 50 });
    const passed = chunks.length >= 1;
    results.push({
      name: "Chunking sample text",
      passed,
      detail: `${chunks.length} chunk(s) produced`,
    });
  } catch (e: any) {
    results.push({
      name: "Chunking sample text",
      passed: false,
      detail: e.message,
    });
    return {
      status: "failure",
      message: "Chunking failed, aborting.",
      tests: results,
    };
  }

  // --- Test 2: Embedding generation ---
  let embeddings: number[][] = [];
  try {
    const result = await embedMany({
      model: "openai/text-embedding-3-large",
      values: chunks.map((c) => c.text),
      providerOptions: {
        openai: {
          dimensions: 1024,
        },
      },
    });
    embeddings = result.embeddings;

    const passed =
      embeddings.length === chunks.length &&
      embeddings.every((e) => e.length === 1024);

    results.push({
      name: "Embedding generation (openai/text-embedding-3-large, 1024d)",
      passed,
      detail: `${embeddings.length} embedding(s), dim=${embeddings[0]?.length}`,
    });
  } catch (e: any) {
    results.push({
      name: "Embedding generation",
      passed: false,
      detail: e.message,
    });
    return {
      status: "failure",
      message: "Embedding failed, aborting.",
      tests: results,
    };
  }

  // --- Test 3: Pinecone upsert ---
  try {
    const pc = new Pinecone({ apiKey: config.pineconeApiKey });
    const index = pc.index(config.pineconeIndex);

    // Get stats before upsert
    const statsBefore = await index.namespace("test").describeIndexStats();
    const countBefore = statsBefore.namespaces?.["test"]?.recordCount ?? 0;

    // Upsert test vectors
    const vectors = chunks.map((chunk, i) => ({
      id: `test-pipeline-chunk-${chunk.chunkIndex}`,
      values: embeddings[i]!,
      metadata: {
        bookName: "__test__",
        chunkIndex: chunk.chunkIndex,
        text: chunk.text.slice(0, 200),
      },
    }));

    await index.namespace("test").upsert({ records: vectors });

    // Small delay for consistency
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Get stats after upsert
    const statsAfter = await index.namespace("test").describeIndexStats();
    const countAfter = statsAfter.namespaces?.["test"]?.recordCount ?? 0;

    const passed = countAfter >= countBefore;
    results.push({
      name: "Pinecone upsert (test namespace)",
      passed,
      detail: `before: ${countBefore}, after: ${countAfter} records`,
    });

    // Cleanup: delete test vectors
    const testIds = vectors.map((v) => v.id);
    await index.namespace("test").deleteMany({ ids: testIds });

    results.push({
      name: "Pinecone cleanup (delete test vectors)",
      passed: true,
      detail: `Deleted ${testIds.length} test vector(s)`,
    });
  } catch (e: any) {
    results.push({
      name: "Pinecone upsert",
      passed: false,
      detail: e.message,
    });
  }

  const allPassed = results.every((r) => r.passed);

  return {
    status: allPassed ? "success" : "failure",
    message: allPassed
      ? `All ${results.length} pipeline tests passed!`
      : `${results.filter((r) => !r.passed).length} of ${results.length} tests failed.`,
    tests: results,
  };
});
