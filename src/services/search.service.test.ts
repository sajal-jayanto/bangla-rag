import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StatusCodes } from "http-status-codes";

import { HttpError } from "../middlewares/error.middleware.js";
import type { ChunkMatch, ChunkRepository } from "../repositories/chunk.repository.js";
import { isNotFoundAnswer, NOT_FOUND_ANSWER, type AnswerService } from "./answer.service.js";
import type { EmbeddingService } from "./embedding.service.js";
import type { ProjectService } from "./project.service.js";
import { SearchService } from "./search.service.js";

const match: ChunkMatch = {
  id: "1",
  document_id: "13",
  file_name: "dhaka.png",
  chunk_index: 0,
  page_number: null,
  content: "ঢাকা বাংলাদেশের রাজধানী।",
  similarity: 0.72451,
};

const setup = ({
  matches = [match],
  answer = "ঢাকা",
  projectExists = true,
}: { matches?: ChunkMatch[]; answer?: string; projectExists?: boolean } = {}) => {
  const calls = { minSimilarity: -1, answered: false };
  const projectService = {
    get: () =>
      projectExists
        ? Promise.resolve({})
        : Promise.reject(new HttpError("Project not found", StatusCodes.NOT_FOUND)),
  } as unknown as ProjectService;
  const chunkRepository = {
    searchByProject: (_p: string, _e: number[], _l: number, minSimilarity: number) => {
      calls.minSimilarity = minSimilarity;
      return Promise.resolve(matches);
    },
  } as unknown as ChunkRepository;
  const embeddingService = {
    embedQuery: () => Promise.resolve([1, 0]),
  } as unknown as EmbeddingService;
  const answerService = {
    answer: () => {
      calls.answered = true;
      return Promise.resolve(answer);
    },
  } as unknown as AnswerService;
  const service = new SearchService(
    projectService,
    chunkRepository,
    embeddingService,
    answerService,
    {
      minSimilarity: 0.6,
    },
  );
  return { calls, service };
};

describe("SearchService", () => {
  it("answers from matching chunks and returns them as sources", async () => {
    const { calls, service } = setup();
    const result = await service.search("7", "5", "বাংলাদেশের রাজধানী কোথায়?", 5);

    assert.equal(calls.minSimilarity, 0.6);
    assert.equal(result.found, true);
    assert.equal(result.answer, "ঢাকা");
    assert.deepEqual(result.sources, [
      {
        documentId: "13",
        fileName: "dhaka.png",
        pageNumber: null,
        chunkIndex: 0,
        similarity: 0.7245,
        content: "ঢাকা বাংলাদেশের রাজধানী।",
      },
    ]);
  });

  it("says জানা নেই without calling the model when nothing is similar enough", async () => {
    const { calls, service } = setup({ matches: [] });
    const result = await service.search("7", "5", "চাঁদে প্রথম কে গিয়েছিলেন?", 5);

    assert.equal(calls.answered, false);
    assert.deepEqual(result, {
      query: "চাঁদে প্রথম কে গিয়েছিলেন?",
      found: false,
      answer: NOT_FOUND_ANSWER,
      sources: [],
    });
  });

  it("says জানা নেই with no sources when the chunks don't contain the answer", async () => {
    const { service } = setup({ answer: NOT_FOUND_ANSWER });
    const result = await service.search("7", "5", "ঢাকার জনসংখ্যা কত?", 5);
    assert.equal(result.found, false);
    assert.equal(result.answer, NOT_FOUND_ANSWER);
    assert.deepEqual(result.sources, []);
  });

  it("returns 404 for a project that isn't the user's", async () => {
    const { service } = setup({ projectExists: false });
    const err = await service.search("7", "5", "প্রশ্ন", 5).catch((e: unknown) => e);
    assert.ok(err instanceof HttpError);
    assert.equal(err.statusCode, StatusCodes.NOT_FOUND);
  });
});

describe("isNotFoundAnswer", () => {
  it("accepts the not-found reply with stray punctuation, rejects real answers", () => {
    for (const reply of ["জানা নেই", "জানা নেই।", ' "জানা নেই" ', ""]) {
      assert.equal(isNotFoundAnswer(reply), true, reply);
    }
    assert.equal(isNotFoundAnswer("ঢাকা"), false);
    assert.equal(isNotFoundAnswer("পদ্মা সেতুর তথ্য জানা নেই এমন নয়, এটি ৬.১৫ কিমি।"), false);
  });
});
