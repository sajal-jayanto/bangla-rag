import { GoogleGenAI } from "@google/genai";
import { StatusCodes } from "http-status-codes";

import { HttpError } from "../middlewares/error.middleware.js";

export const EMBEDDING_DIMENSIONS = 768;

const BATCH_SIZE = 100;
const EMBED_TIMEOUT_MS = 30_000;

type EmbeddingTask = "RETRIEVAL_DOCUMENT" | "QUESTION_ANSWERING";

export interface EmbeddingOptions {
  apiKey: string;
  model: string;
}

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

  embedDocuments(texts: string[]): Promise<number[][]> {
    return this.embed(texts, "RETRIEVAL_DOCUMENT");
  }

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
