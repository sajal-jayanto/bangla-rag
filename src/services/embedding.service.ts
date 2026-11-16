import { GoogleGenAI } from "@google/genai";
import { StatusCodes } from "http-status-codes";

import { HttpError } from "../middlewares/error.middleware.js";

/** Must match `vector(768)` on `chunks.embedding` (migrations/005_create_chunks.sql). */
export const EMBEDDING_DIMENSIONS = 768;

// The Gemini API accepts at most 100 texts per embedContent request.
const BATCH_SIZE = 100;
const EMBED_TIMEOUT_MS = 30_000;

// Stored chunks and search questions use matching task types so their vectors compare well.
type EmbeddingTask = "RETRIEVAL_DOCUMENT" | "QUESTION_ANSWERING";

export interface EmbeddingOptions {
  apiKey: string;
  model: string;
}

/** Scales to unit length; Gemini only normalises the full 3072-dimension output itself. */
const normalize = (values: number[]): number[] => {
  const norm = Math.hypot(...values);
  return norm === 0 ? values : values.map((v) => v / norm);
};

export class EmbeddingService {
  private readonly client: GoogleGenAI | null;

  constructor(private readonly options: EmbeddingOptions) {
    this.client = options.apiKey ? new GoogleGenAI({ apiKey: options.apiKey }) : null;
  }

  get model(): string {
    return this.options.model;
  }

  /** Embeds texts for storage and later retrieval; returns one vector per text, in order. */
  embedDocuments(texts: string[]): Promise<number[][]> {
    return this.embed(texts, "RETRIEVAL_DOCUMENT");
  }

  /** Embeds a search question, to compare against stored chunk embeddings. */
  async embedQuery(question: string): Promise<number[]> {
    const [vector] = await this.embed([question], "QUESTION_ANSWERING");
    return vector;
  }

  private async embed(texts: string[], taskType: EmbeddingTask): Promise<number[][]> {
    if (!this.client) {
      throw new HttpError(
        "Embedding is unavailable: GEMINI_API_KEY is not set on the server",
        StatusCodes.SERVICE_UNAVAILABLE,
      );
    }

    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      let embeddings: { values?: number[] }[] | undefined;
      try {
        ({ embeddings } = await this.client.models.embedContent({
          model: this.options.model,
          contents: batch,
          config: {
            taskType,
            outputDimensionality: EMBEDDING_DIMENSIONS,
            abortSignal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
          },
        }));
      } catch (err) {
        throw new HttpError("Embedding the text with Gemini failed", StatusCodes.BAD_GATEWAY, {
          cause: err,
        });
      }

      if (embeddings?.length !== batch.length) {
        throw new HttpError(
          "Gemini returned the wrong number of embeddings",
          StatusCodes.BAD_GATEWAY,
        );
      }
      for (const { values } of embeddings) {
        if (values?.length !== EMBEDDING_DIMENSIONS) {
          throw new HttpError(
            "Gemini returned an embedding of the wrong size",
            StatusCodes.BAD_GATEWAY,
          );
        }
        vectors.push(normalize(values));
      }
    }
    return vectors;
  }
}
