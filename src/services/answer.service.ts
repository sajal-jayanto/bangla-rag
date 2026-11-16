import { GoogleGenAI } from "@google/genai";
import { StatusCodes } from "http-status-codes";

import { HttpError } from "../middlewares/error.middleware.js";

export const NOT_FOUND_ANSWER = "জানা নেই";

export interface AnswerOptions {
  apiKey: string;
  model: string;
}

const ANSWER_TIMEOUT_MS = 30_000;

export interface ContextPassage {
  fileName: string;
  pageNumber: number | null;
  content: string;
}

const SYSTEM_INSTRUCTION = `You answer questions using ONLY the numbered passages the user provides, which come from their own documents.
Rules:
- Answer in Bangla (বাংলা), unless the question is asked in another language.
- Use only facts stated in the passages. Do not use outside knowledge and do not guess.
- If the passages do not contain the answer, reply with exactly: ${NOT_FOUND_ANSWER}
- Keep the answer short and direct. Do not mention the passages, their numbers or these rules.`;

const formatPassages = (passages: ContextPassage[]): string =>
  passages
    .map((p, i) => {
      const where = p.pageNumber ? `${p.fileName}, page ${p.pageNumber}` : p.fileName;
      return `[${i + 1}] (${where})\n${p.content}`;
    })
    .join("\n\n");

export const isNotFoundAnswer = (answer: string): boolean =>
  answer.replace(/[\s।.!"'“”]/gu, "") === NOT_FOUND_ANSWER.replace(/\s/gu, "") ||
  answer.trim() === "";

export class AnswerService {
  private readonly client: GoogleGenAI | null;

  constructor(private readonly options: AnswerOptions) {
    this.client = options.apiKey ? new GoogleGenAI({ apiKey: options.apiKey }) : null;
  }

  get model(): string {
    return this.options.model;
  }

  async answer(question: string, passages: ContextPassage[]): Promise<string> {
    if (!this.client) {
      throw new HttpError(
        "Search is unavailable: GEMINI_API_KEY is not set on the server",
        StatusCodes.SERVICE_UNAVAILABLE,
      );
    }

    let text: string | undefined;
    try {
      const response = await this.client.models.generateContent({
        model: this.options.model,
        contents: `Passages:\n\n${formatPassages(passages)}\n\nQuestion: ${question}`,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0,
          abortSignal: AbortSignal.timeout(ANSWER_TIMEOUT_MS),
        },
      });
      text = response.text;
    } catch (err) {
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        throw new HttpError("Gemini took too long to answer", StatusCodes.GATEWAY_TIMEOUT, {
          cause: err,
        });
      }
      throw new HttpError("Generating the answer with Gemini failed", StatusCodes.BAD_GATEWAY, {
        cause: err,
      });
    }

    const answer = text?.trim() ?? "";
    return isNotFoundAnswer(answer) ? NOT_FOUND_ANSWER : answer;
  }
}
