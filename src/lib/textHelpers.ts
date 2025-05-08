import OpenAI from "openai";
import { encoding_for_model } from "tiktoken";

export const OPENAI_MODEL = "gpt-4o-mini";
export const EMBEDDING_MODEL = "text-embedding-3-large";
export const WHITESPACE_RATIO_THRESHOLD = 3;
export const openai = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] });

export const normalizeText = async (content: string): Promise<string> => {
  const nonWhitespaceCharacterCount = content.replace(/\s/g, "").length;
  const whitespaceCharacterCount = content.length - nonWhitespaceCharacterCount;
  const nonWhitespaceToWhitespaceRatio =
    nonWhitespaceCharacterCount / whitespaceCharacterCount;

  if (nonWhitespaceToWhitespaceRatio > WHITESPACE_RATIO_THRESHOLD) {
    return content.replace(/\s+/g, " ").trim();
  }

  const prompt = `
      As a professional text cleaner, your job is to normalize the following text to improve readability. Retain the original meaning, semantics. Adjust formatting issues such as excessive spaces, misplaced line breaks, or unintended special characters to make the text syntactically clear and human-readable.
      Use the same language as the text. Never try to translate the text to other languages. You will only return the cleaned text without any additional text or comments.
      `;

  try {
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: content },
      ],
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
  return cleanedText.trim();
};

/**
 * Creates chunks that are not longer than a token limit.
 * @param text - The text to chunk
 * @param tokenLimit - The token limit
 * @returns An array of text chunks
 */
export function createChunksBasedOnTokenLimit(
  text: string,
  tokenLimit: number
): string[] {
  const enc = encoding_for_model(EMBEDDING_MODEL);
  const chunks: string[] = [];
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  let currentChunk = "";
  let currentTokenCount = 0;

  // More conservative chunking
  for (const sentence of sentences) {
    const sentenceTokens = enc.encode(sentence).length;

    // If a single sentence is too long, split it into smaller parts
    if (sentenceTokens > tokenLimit) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
        currentTokenCount = 0;
      }

      // Split long sentence into smaller chunks based on words
      const words = sentence.split(/\s+/);
      let tempChunk = "";
      let tempTokenCount = 0;

      for (const word of words) {
        const wordTokens = enc.encode(word + " ").length;
        if (tempTokenCount + wordTokens > tokenLimit) {
          chunks.push(tempChunk.trim());
          tempChunk = word + " ";
          tempTokenCount = wordTokens;
        } else {
          tempChunk += word + " ";
          tempTokenCount += wordTokens;
        }
      }

      if (tempChunk) {
        chunks.push(tempChunk.trim());
      }
    } else if (currentTokenCount + sentenceTokens > tokenLimit * 0.9) {
      // Using 90% of limit as safety margin
      chunks.push(currentChunk.trim());
      currentChunk = sentence + " ";
      currentTokenCount = sentenceTokens;
    } else {
      currentChunk += sentence + " ";
      currentTokenCount += sentenceTokens;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  enc.free();
  return chunks;
}

export function cosineSimilarity(vec1: number[], vec2: number[]): number {
  const dotProduct = vec1.reduce((acc, val, i) => acc + val * vec2[i], 0);
  const norm1 = Math.sqrt(vec1.reduce((acc, val) => acc + val * val, 0));
  const norm2 = Math.sqrt(vec2.reduce((acc, val) => acc + val * val, 0));
  return dotProduct / (norm1 * norm2);
}
