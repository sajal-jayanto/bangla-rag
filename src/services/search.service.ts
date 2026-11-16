import type { ChunkMatch, ChunkRepository } from "../repositories/chunk.repository.js";
import { NOT_FOUND_ANSWER, type AnswerService } from "./answer.service.js";
import type { EmbeddingService } from "./embedding.service.js";
import type { ProjectService } from "./project.service.js";

export interface SearchSource {
  documentId: string;
  fileName: string;
  pageNumber: number | null;
  chunkIndex: number;
  similarity: number;
  content: string;
}

export interface SearchResult {
  query: string;
  found: boolean;
  answer: string;
  sources: SearchSource[];
}

export interface SearchOptions {
  minSimilarity: number;
}

const DEFAULT_OPTIONS: SearchOptions = { minSimilarity: 0.6 };

const toSource = (m: ChunkMatch): SearchSource => ({
  documentId: m.document_id,
  fileName: m.file_name,
  pageNumber: m.page_number,
  chunkIndex: m.chunk_index,
  similarity: Math.round(m.similarity * 10000) / 10000,
  content: m.content,
});

export class SearchService {
  private readonly options: SearchOptions;

  constructor(
    private readonly projectService: ProjectService,
    private readonly chunkRepository: ChunkRepository,
    private readonly embeddingService: EmbeddingService,
    private readonly answerService: AnswerService,
    options: Partial<SearchOptions> = {},
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async search(
    ownerId: string,
    projectId: string,
    query: string,
    limit: number,
  ): Promise<SearchResult> {
    await this.projectService.get(ownerId, projectId);
    const notFound: SearchResult = { query, found: false, answer: NOT_FOUND_ANSWER, sources: [] };

    const embedding = await this.embeddingService.embedQuery(query);
    const matches = await this.chunkRepository.searchByProject(
      projectId,
      embedding,
      limit,
      this.options.minSimilarity,
    );
    if (matches.length === 0) return notFound;

    const answer = await this.answerService.answer(
      query,
      matches.map((m) => ({
        fileName: m.file_name,
        pageNumber: m.page_number,
        content: m.content,
      })),
    );
    if (answer === NOT_FOUND_ANSWER) return notFound;

    return { query, found: true, answer, sources: matches.map(toSource) };
  }
}
