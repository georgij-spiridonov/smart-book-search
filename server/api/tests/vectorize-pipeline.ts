import { embedMany } from "ai";
import { Pinecone } from "@pinecone-database/pinecone";
import { splitPages } from "../../utils/textSplitter";
import type { PageText } from "../../utils/textParser";

/**
 * GET /api/tests/vectorize-pipeline
 *
 * Integration test: verifies the full vectorization pipeline v3
 * including page-aware chunking, embedding, Pinecone upsert with pageNumber,
 * resume mechanism, and cleanup.
 */
export default defineEventHandler(async () => {
  const config = useRuntimeConfig();
  const results: { name: string; passed: boolean; detail: string }[] = [];

  // --- Sample pages (simulating a 3-page document) ---
  const samplePages: PageText[] = [
    {
      pageNumber: 1,
      text: "Artificial intelligence is a branch of computer science. It deals with creating systems that can perform tasks requiring human intelligence.",
    },
    {
      pageNumber: 2,
      text: "Machine learning is a subset of AI that enables systems to learn from data. Neural networks are computing systems inspired by biological neural networks.",
    },
    {
      pageNumber: 3,
      text: "Deep learning uses multi-layered neural networks to analyze complex patterns in large datasets.",
    },
  ];

  // --- Test 1: Page-aware chunking ---
  let chunks: ReturnType<typeof splitPages> = [];
  try {
    chunks = splitPages(samplePages, { chunkSize: 200, chunkOverlap: 50 });
    const hasPageNumbers = chunks.every(
      (c) => c.pageNumber >= 1 && c.pageNumber <= 3,
    );
    const passed = chunks.length >= 1 && hasPageNumbers;
    results.push({
      name: "Page-aware chunking",
      passed,
      detail: `${chunks.length} chunk(s), pages: [${[...new Set(chunks.map((c) => c.pageNumber))].join(",")}]`,
    });
  } catch (e: any) {
    results.push({
      name: "Page-aware chunking",
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
        openai: { dimensions: 1024 },
      },
    });
    embeddings = result.embeddings;

    const passed =
      embeddings.length === chunks.length &&
      embeddings.every((e) => e.length === 1024);

    results.push({
      name: "Embedding generation (1024d)",
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

  // --- Test 3: Pinecone upsert with pageNumber ---
  const bookSlug = "test-pipeline-v3";
  try {
    const pc = new Pinecone({ apiKey: config.pineconeApiKey });
    const index = pc.index(config.pineconeIndex);

    const vectors = chunks.map((chunk, i) => ({
      id: `${bookSlug}-chunk-${chunk.chunkIndex}`,
      values: embeddings[i]!,
      metadata: {
        bookName: "__test_v3__",
        chunkIndex: chunk.chunkIndex,
        pageNumber: chunk.pageNumber,
        text: chunk.text.slice(0, 200),
      },
    }));

    await index.namespace("test").upsert({ records: vectors });
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Verify pageNumber in metadata
    const fetchResult = await index
      .namespace("test")
      .fetch({ ids: [vectors[0]!.id] });

    const fetchedRecord = fetchResult.records?.[vectors[0]!.id];
    const hasPageNumber = fetchedRecord?.metadata?.pageNumber !== undefined;

    results.push({
      name: "Pinecone upsert (with pageNumber)",
      passed: hasPageNumber,
      detail: `pageNumber=${fetchedRecord?.metadata?.pageNumber}, vectorCount=${vectors.length}`,
    });

    // --- Test 4: Resume mechanism ---
    const existingIds = new Set<string>();
    const fetched = await index
      .namespace("test")
      .fetch({ ids: vectors.map((v) => v.id) });
    if (fetched.records) {
      for (const id of Object.keys(fetched.records)) {
        existingIds.add(id);
      }
    }

    const remainingChunks = chunks.filter(
      (c) => !existingIds.has(`${bookSlug}-chunk-${c.chunkIndex}`),
    );

    results.push({
      name: "Resume mechanism (skip existing)",
      passed:
        remainingChunks.length === 0 && existingIds.size === vectors.length,
      detail: `existing=${existingIds.size}, remaining=${remainingChunks.length}`,
    });

    // Cleanup
    await index.namespace("test").deleteMany({ ids: vectors.map((v) => v.id) });

    results.push({
      name: "Pinecone cleanup",
      passed: true,
      detail: `Deleted ${vectors.length} test vector(s)`,
    });
  } catch (e: any) {
    results.push({
      name: "Pinecone operations",
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
