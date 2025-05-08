/**
 * https://weaviate.io/blog/late-chunking
 * https://colab.research.google.com/drive/15vNZb6AsU7byjYoaEtXuNu567JWNzXOz?usp=sharing#scrollTo=abe3d93b9e6609b9
 * https://github.com/jina-ai/late-chunking/blob/main/chunked_pooling/chunking.py
 */
import pdfExtractor from "./pdf-extractor";
import OpenAI from "openai";
import { encoding_for_model } from "tiktoken";

const OPENAI_MODEL = "gpt-4o-mini";
const EMBEDDING_MODEL = "text-embedding-3-large";
const TOKEN_LIMIT = 8000;
const CHUNK_TOKEN_LIMIT = 700;
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
function createChunksBasedOnTokenLimit(
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

function cosineSimilarity(vec1: number[], vec2: number[]): number {
  const dotProduct = vec1.reduce((acc, val, i) => acc + val * vec2[i], 0);
  const norm1 = Math.sqrt(vec1.reduce((acc, val) => acc + val * val, 0));
  const norm2 = Math.sqrt(vec2.reduce((acc, val) => acc + val * val, 0));
  return dotProduct / (norm1 * norm2);
}

/**
 * This function is used to chunk text into semantically meaningful chunks.
 * 1. It gets an embedding for the entire text using OpenAI's embedding model to capture the full context.
 * 2. Then it creates initial chunks based on sentences while respecting token limits:
 *    - Splits text into sentences using regex
 *    - Combines sentences into chunks while tracking token count
 *    - Ensures no chunk exceeds the token limit
 * 3. For each chunk, it gets embeddings while considering the full context.
 * 4. It uses cosine similarity to rank chunks based on their similarity to the full text embedding, which helps preserve semantic relationships.
 * @param text - The text to chunk
 * @returns Array of text chunks
 */
async function lateChunking(
  text: string,
  tokenLimit: number
): Promise<string[]> {
  // First get the embedding for the entire text
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    encoding_format: "float",
  });

  // Get the full text embedding
  const fullTextEmbedding = response.data[0].embedding;

  // Create initial chunks based on sentences
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks: string[] = [];
  let currentChunk = "";
  let currentTokenCount = 0;
  const enc = encoding_for_model(EMBEDDING_MODEL);

  for (const sentence of sentences) {
    const sentenceTokenCount = enc.encode(sentence).length;

    // If adding this sentence would exceed token limit, start a new chunk
    if (currentTokenCount + sentenceTokenCount > tokenLimit) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = sentence;
      currentTokenCount = sentenceTokenCount;
    } else {
      currentChunk += " " + sentence;
      currentTokenCount += sentenceTokenCount;
    }
  }

  // Add the last chunk if it exists
  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  enc.free();

  // Now get embeddings for each chunk while considering the full context
  const chunkEmbeddings = await Promise.all(
    chunks.map(async (chunk) => {
      const chunkResponse = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: chunk,
        encoding_format: "float",
      });
      return chunkResponse.data[0].embedding;
    })
  );

  // Use cosine similarity to rerank chunks based on their similarity to the full text
  const similarities = chunkEmbeddings.map((chunkEmbedding) =>
    cosineSimilarity(chunkEmbedding, fullTextEmbedding)
  );

  // Sort chunks by similarity score
  const rankedChunks = chunks
    .map((chunk, i) => ({ chunk, score: similarities[i] }))
    .sort((a, b) => b.score - a.score)
    .map(({ chunk }) => chunk);

  return rankedChunks;
}

export const chunk = async (file: string): Promise<string[]> => {
  const pages = await pdfExtractor.extractPDF(file);
  console.log(`├── Extracted ${pages.length} pages`);

  const cleanedPages = await Promise.all(
    pages.map(async (page) => {
      return await preprocessText(page.text);
    })
  );

  const fullText = cleanedPages.map((page) => page).join("\n");

  // There is a token limit for each embedding model so we need to split the text into preChunks
  const preChunks = createChunksBasedOnTokenLimit(fullText, TOKEN_LIMIT);
  console.log(`├── Created ${preChunks.length} pre-chunked segments`);
  const chunks = await Promise.all(
    preChunks.map((chunk) => lateChunking(chunk, CHUNK_TOKEN_LIMIT))
  );
  console.log(`├── Created ${chunks.length} semantically chunked segments`);
  return chunks.flat();
};
