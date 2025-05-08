/*
Notes:
- The minChunkSize should be smaller
*/

import pdfExtractor, { PageChunkType, PageText } from "./pdf-extractor";
import OpenAI from "openai";

const OPENAI_MODEL = "gpt-4o";
const WHITESPACE_RATIO_THRESHOLD = 3;
const openai = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] });

const normalizeText = async (content: string): Promise<string> => {
  const nonWhitespaceCharacterCount = content.replace(/\s/g, "").length;
  const whitespaceCharacterCount = content.length - nonWhitespaceCharacterCount;
  const nonWhitespaceToWhitespaceRatio =
    nonWhitespaceCharacterCount / whitespaceCharacterCount;

  if (nonWhitespaceToWhitespaceRatio > WHITESPACE_RATIO_THRESHOLD) {
    return content.replace(/\s+/g, " ").trim();
  }

  const prompt = `
      Normalize the following text to improve readability. Retain the original meaning, semantics. Use Hungarian language. Adjust formatting issues such as excessive spaces, misplaced line breaks, or unintended special characters to make the text syntactically clear and human-readable.
      Use the same language as the text. Never try to translate the text to other languages.
      <text>
      ${content}
      </text>
      `;

  try {
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: "system", content: prompt }],
    });
    const normalizedText = response.choices[0].message.content?.trim() || "";
    console.log("Whitespace character count", whitespaceCharacterCount);
    console.log("Non-whitespace character count", nonWhitespaceCharacterCount);
    console.log(
      "Non-whitespace to whitespace ratio",
      nonWhitespaceToWhitespaceRatio
    );
    console.log("___original text", content.slice(0, 100));
    console.log("___normalizedText", normalizedText.slice(0, 100));
    return normalizedText;
  } catch (error) {
    console.error("Error generating context:", error);
    return "";
  }
};

/**
 * Preprocesses text by cleaning and normalizing.
 * @param text - The raw text
 * @returns The cleaned text.
 */
export const preprocessText = async (text: string): Promise<string> => {
  if (text.length < 50) {
    return text;
  }
  const cleanedText = await normalizeText(text);
  return cleanedText;
};

/**
 * Splits text into chunks based on sentence boundaries or punctuation.
 * This version ensures that no chunk is smaller than minChunkSize.
 * @param text - The cleaned text to split.
 * @param maxChunkSize - The maximum number of characters per chunk.
 * @param minChunkSize - The minimum number of characters per chunk.
 * @returns An array of text chunks.
 */
export const chunkText = (
  text: string,
  maxChunkSize = 1000,
  minChunkSize = 100
): string[] => {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  const chunks: string[] = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    // If appending the sentence doesn't exceed maxChunkSize, just append it.
    if (currentChunk.length + sentence.length <= maxChunkSize) {
      currentChunk += sentence;
      continue;
    }

    // If adding the sentence would exceed maxChunkSize:
    if (currentChunk.length < minChunkSize) {
      // Combine sentence to currentChunk to try and meet minChunkSize
      currentChunk += sentence;
      // If still under minChunkSize, continue to next sentence without pushing
      if (currentChunk.length < minChunkSize) {
        continue;
      }
      // Otherwise, process the currentChunk further if needed.
      processAndPushChunk(currentChunk, chunks, maxChunkSize, minChunkSize);
      currentChunk = "";
      continue;
    } else {
      // currentChunk is valid, push it.
      processAndPushChunk(currentChunk, chunks, maxChunkSize, minChunkSize);
      currentChunk = "";
      // Process the sentence: It might itself be too long.
      if (sentence.length > maxChunkSize) {
        processAndPushChunk(sentence, chunks, maxChunkSize, minChunkSize);
      } else {
        currentChunk = sentence;
      }
    }
  }

  if (currentChunk.length >= minChunkSize) {
    console.log(currentChunk.length);
    chunks.push(currentChunk.trim());
  }

  return chunks;
};

/**
 * Processes a chunk of text that might exceed maxChunkSize by further splitting it
 * using comma/semicolon boundaries, and ensuring that each resulting chunk has at least
 * minChunkSize characters by merging subchunks as needed.
 *
 * @param text - The text chunk to process.
 * @param chunks - The array to push valid chunks into.
 * @param maxChunkSize - The maximum number of characters per chunk.
 * @param minChunkSize - The minimum number of characters per chunk.
 */
const processAndPushChunk = (
  text: string,
  chunks: string[],
  maxChunkSize: number,
  minChunkSize: number
) => {
  // If the chunk is within maxChunkSize, push it directly.
  if (text.length <= maxChunkSize) {
    // Check if the text meets minChunkSize
    if (text.trim().length >= minChunkSize) {
      chunks.push(text.trim());
    }
    return;
  }

  // If text is longer than maxChunkSize, attempt to split it using delimiters.
  const subchunks = text.split(/[,;]/);
  let accumulator = "";
  for (const sub of subchunks) {
    const trimmedSub = sub.trim();
    if (!trimmedSub) continue;

    if (accumulator.length + trimmedSub.length + 1 <= maxChunkSize) {
      // +1 for a space or delimiter when merging
      accumulator += accumulator ? " " + trimmedSub : trimmedSub;
    } else {
      // If the accumulator does not meet minChunkSize, combine them regardless.
      if (accumulator.length < minChunkSize) {
        accumulator += " " + trimmedSub;
        // If after combining it meets minChunkSize and isn't too long, push it.
        if (
          accumulator.length >= minChunkSize &&
          accumulator.length <= maxChunkSize
        ) {
          chunks.push(accumulator.trim());
          accumulator = "";
        }
      } else {
        chunks.push(accumulator.trim());
        accumulator = trimmedSub;
      }
    }
  }
  if (accumulator.length >= minChunkSize) {
    chunks.push(accumulator.trim());
  }
};

function concatenateTextChunks(
  page: PageText,
  previousPage?: PageText,
  nextPage?: PageText
) {
  const lastChunkOfPreviousPage = previousPage?.chunks?.slice(-1)[0];
  const firstChunkOfNextPage = nextPage?.chunks?.slice(0)[0];
  const allChunks = [
    ...(lastChunkOfPreviousPage ? [lastChunkOfPreviousPage] : []),
    ...(page.chunks ?? []),
    ...(firstChunkOfNextPage ? [firstChunkOfNextPage] : []),
  ];

  return allChunks
    ?.filter((chunk) => chunk.type === PageChunkType.TEXT)
    .map((chunk) => chunk.text)
    .join("\n");
}

export const chunkV1 = async (file: string): Promise<string[]> => {
  return [];
  /*
  const pages = await pdfExtractor.extractPDF(file);
  console.log(`├── Extracted ${pages.length} pages`);

  const cleanedPages = await Promise.all(
    pages.map(async (page, index) => {
      const nextPage = pages[index + 1];
      const previousPage = pages[index - 1];

      const pageText = page.chunks
        ? concatenateTextChunks(page, previousPage, nextPage)
        : page.text;

      return {
        ...page,
        pageNumber: page.pageNumber,
        text: await preprocessText(pageText),
      };
    })
  );

  const allChunks: string[] = [];
  for (let i = 0; i < cleanedPages.length; i++) {
    const currentPage = cleanedPages[i];
    if (!currentPage.text) continue;

    const tableChunksArray =
      currentPage.chunks
        ?.filter((chunk) => chunk.type === PageChunkType.TABLE)
        .map((chunk) => chunk.text) ?? [];

    const chunks = currentPage.chunks
      ? [...tableChunksArray, ...chunkText(currentPage.text, 1000, 200)]
      : chunkText(currentPage.text, 1000, 200);

    allChunks.push(...chunks);
  }
  return allChunks;
  */
};
