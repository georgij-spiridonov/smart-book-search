import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockedGetRedisClient, pipelineMock } = vi.hoisted(() => {
  const pMock = {
    hset: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    sadd: vi.fn().mockReturnThis(),
    hgetall: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  };

  const redisMethodsMock = {
    pipeline: vi.fn(() => pMock),
    hgetall: vi.fn(),
    hset: vi.fn(),
    expire: vi.fn(),
    srem: vi.fn(),
    smembers: vi.fn(),
  };

  return {
    mockedGetRedisClient: vi.fn(() => redisMethodsMock),
    pipelineMock: pMock,
  };
});

vi.mock("../utils/redis", () => ({
  getRedisClient: mockedGetRedisClient,
}));

vi.mock("../utils/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import {
  createJob,
  getJob,
  updateJob,
  generateJobId,
  getUserJobs,
} from "../utils/jobStore";

describe("Хранилище задач (jobStore)", () => {
  let redisClientInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();
    redisClientInstance = mockedGetRedisClient();
  });

  it("createJob должен инициализировать задачу и сохранять её через pipeline", async () => {
    const jobId = "test-job";
    const bookId = "book-123";
    const userId = "user-456";
    const bookName = "Test Book";

    await createJob(jobId, bookId, bookName, userId);

    expect(redisClientInstance.pipeline).toHaveBeenCalled();
    expect(pipelineMock.hset).toHaveBeenCalled();
    expect(pipelineMock.expire).toHaveBeenCalled();
    expect(pipelineMock.sadd).toHaveBeenCalledWith("smart-book-search:user-jobs:user-456", jobId);
    expect(pipelineMock.exec).toHaveBeenCalled();
  });

  it("getJob должен возвращать распарсенное состояние задачи", async () => {
    const jobId = "job-123";
    redisClientInstance.hgetall.mockResolvedValueOnce({
      id: jobId,
      status: "processing",
      progress: JSON.stringify({ currentPage: 5, totalPages: 10, chunksProcessed: 20, totalChunks: 40 }),
      result: JSON.stringify({ totalPages: 10, totalChunks: 40, skipped: 0, newVectors: 40 }),
      createdAt: "1625097600000",
      updatedAt: "1625097600000",
    });

    const job = await getJob(jobId);

    expect(job).toBeDefined();
    expect(job?.status).toBe("processing");
    expect(job?.progress.currentPage).toBe(5);
    expect(job?.result?.newVectors).toBe(40);
    expect(typeof job?.createdAt).toBe("number");
  });

  it("getJob должен возвращать undefined, если задача не найдена", async () => {
    redisClientInstance.hgetall.mockResolvedValueOnce({});
    const job = await getJob("non-existent");
    expect(job).toBeUndefined();
  });

  it("getUserJobs должен возвращать список задач пользователя", async () => {
    const userId = "user-1";
    redisClientInstance.smembers.mockResolvedValueOnce(["job-1", "job-2"]);
    
    pipelineMock.exec.mockResolvedValueOnce([
      { id: "job-1", status: "completed", progress: "{}" },
      {} // имитируем удаленную/истекшую задачу
    ]);

    const jobs = await getUserJobs(userId);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.id).toBe("job-1");
    // Проверка удаления "битого" ID
    expect(redisClientInstance.srem).toHaveBeenCalledWith("smart-book-search:user-jobs:user-1", "job-2");
  });

  it("getUserJobs должен возвращать пустой список, если у пользователя нет задач", async () => {
    redisClientInstance.smembers.mockResolvedValueOnce([]);
    const jobs = await getUserJobs("user-none");
    expect(jobs).toEqual([]);
  });

  it("updateJob должен сериализовать progress и result, обновлять updatedAt", async () => {
    const jobId = "job-123";
    const result = { totalPages: 10, totalChunks: 40, skipped: 0, newVectors: 40 };
    
    await updateJob(jobId, { 
      status: "completed", 
      progress: { currentPage: 10, totalPages: 10, chunksProcessed: 40, totalChunks: 40 },
      result
    });

    expect(redisClientInstance.hset).toHaveBeenCalledWith(
      "smart-book-search:jobs:job-123",
      expect.objectContaining({
        status: "completed",
        progress: expect.any(String),
        result: JSON.stringify(result),
        updatedAt: expect.any(Number),
      })
    );
  });

  it("generateJobId должен возвращать строку с префиксом job-", () => {
    const id = generateJobId();
    expect(id).toMatch(/^job-\d+-[a-z0-9]+$/);
  });
});
