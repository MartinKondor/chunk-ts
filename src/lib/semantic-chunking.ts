/**
 * https://weaviate.io/blog/late-chunking
 * https://colab.research.google.com/drive/15vNZb6AsU7byjYoaEtXuNu567JWNzXOz?usp=sharing#scrollTo=abe3d93b9e6609b9
 * https://github.com/jina-ai/late-chunking/blob/main/chunked_pooling/chunking.py
 */
import pdfExtractor from "./pdf-extractor";
import { encoding_for_model } from "tiktoken";
import { split as splitSentences } from "sentence-splitter";
import {
  openai,
  EMBEDDING_MODEL,
  cosineSimilarity,
  preprocessText,
} from "./textHelpers";

const TOKEN_LIMIT = 8000;
const CHUNK_TOKEN_LIMIT = 200;
const SENTENCE_SIMILARITY_THRESHOLD = 0.9;
const MIN_CLUSTER_SIZE = 3;

const splitIntoBatches = (sentences: string[], tokenLimit: number) => {
  const batches: string[][] = [];
  const enc = encoding_for_model(EMBEDDING_MODEL);
  let currentBatch: string[] = [];
  let currentTokenCount = 0;

  for (const sentence of sentences) {
    const sentenceTokens = enc.encode(sentence).length;

    if (
      currentTokenCount + sentenceTokens > tokenLimit &&
      currentBatch.length > 0
    ) {
      batches.push(currentBatch);
      currentBatch = [];
      currentTokenCount = 0;
    }

    // Handle sentences that are longer than the token limit
    if (sentenceTokens > tokenLimit) {
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [];
        currentTokenCount = 0;
      }
      // Split the sentence into batches of the token limit
      const batch = splitIntoBatches([sentence], tokenLimit);
      batches.push(...batch);
      continue;
    }

    // Add the sentence to the current batch
    currentBatch.push(sentence);
    currentTokenCount += sentenceTokens;
  }

  // Add the last batch if it's not empty
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  enc.free();
  return batches;
};

/**
 * This function is used to chunk text into semantically meaningful chunks.
 * 1. It gets embeddings for each sentence in the text
 * 2. Calculates semantic similarity between all sentences
 * 3. Groups similar sentences together based on their semantic meaning
 * 4. Ensures each chunk stays within token limits while preserving semantic relationships
 * @param text - The text to chunk
 * @param tokenLimit - Maximum tokens per chunk
 * @returns Array of semantically coherent text chunks
 */
async function semanticChunking(
  text: string,
  tokenLimit: number
): Promise<string[]> {
  const sentences = splitSentences(text)
    .map((sentence) => sentence.raw.trim().replace(/\s+/g, " "))
    .filter((sentence) => sentence.length > 0);
  if (sentences.length <= 1) {
    return [text];
  }

  const enc = encoding_for_model(EMBEDDING_MODEL);

  // Get embeddings for each sentence
  // Create sentence batches to avoid token limit of the embedding model
  // Run embedding for each batch then combine the results into a single array
  const sentenceBatches = splitIntoBatches(sentences, TOKEN_LIMIT);
  console.log(`├── Created ${sentenceBatches.length} sentence batches`);
  const sentenceEmbeddings: number[][] = [];

  for (const batch of sentenceBatches) {
    const embeddingResponse = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      encoding_format: "float",
    });

    sentenceEmbeddings.push(
      ...embeddingResponse.data.map((item) => item.embedding)
    );
  }

  // Calculate similarity matrix between all sentences
  const similarityMatrix: number[][] = [];
  for (let i = 0; i < sentences.length; i++) {
    similarityMatrix[i] = [];
    for (let j = 0; j < sentences.length; j++) {
      similarityMatrix[i][j] = cosineSimilarity(
        sentenceEmbeddings[i],
        sentenceEmbeddings[j]
      );
    }
  }

  // Create semantic clusters - sentences that are semantically similar
  const visited = new Set<number>();
  const clusters: number[][] = [];

  // First pass: Create initial clusters by similarity
  for (let i = 0; i < sentences.length; i++) {
    if (visited.has(i)) continue;

    const cluster: number[] = [i];
    visited.add(i);

    for (let j = 0; j < sentences.length; j++) {
      if (i === j || visited.has(j)) continue;

      // Add to cluster if similar enough
      if (similarityMatrix[i][j] >= SENTENCE_SIMILARITY_THRESHOLD) {
        cluster.push(j);
        visited.add(j);
      }
    }

    clusters.push(cluster);
  }

  // Second pass: Merge small clusters with their most similar neighbors
  let mergedClusters: number[][] = [...clusters];
  while (true) {
    const smallClusters = mergedClusters.filter(
      (cluster) => cluster.length < MIN_CLUSTER_SIZE
    );

    if (smallClusters.length === 0) break;

    let merged = false;
    for (const smallCluster of smallClusters) {
      if (smallCluster.length === 0) continue;

      // Find most similar cluster to merge with
      let bestClusterIdx = -1;
      let bestAvgSimilarity = 0;

      for (let i = 0; i < mergedClusters.length; i++) {
        const candidateCluster = mergedClusters[i];
        if (candidateCluster === smallCluster || candidateCluster.length === 0)
          continue;

        // Calculate average similarity between the small cluster and candidate
        let totalSim = 0,
          count = 0;
        for (const srcIdx of smallCluster) {
          for (const tgtIdx of candidateCluster) {
            totalSim += similarityMatrix[srcIdx][tgtIdx];
            count++;
          }
        }

        const avgSim = count > 0 ? totalSim / count : 0;
        if (avgSim > bestAvgSimilarity) {
          bestAvgSimilarity = avgSim;
          bestClusterIdx = i;
        }
      }

      // Merge if we found a suitable cluster
      if (
        bestClusterIdx >= 0 &&
        bestAvgSimilarity > SENTENCE_SIMILARITY_THRESHOLD * 0.8
      ) {
        mergedClusters[bestClusterIdx] = [
          ...mergedClusters[bestClusterIdx],
          ...smallCluster,
        ];
        mergedClusters = mergedClusters.filter((c) => c !== smallCluster);
        merged = true;
        break;
      }
    }

    // If we couldn't merge any small clusters, break the loop
    if (!merged) break;
  }

  // Sort clusters by document order
  mergedClusters.forEach((cluster) => cluster.sort((a, b) => a - b));
  mergedClusters.sort((a, b) => a[0] - b[0]);

  // Form chunks from clusters while respecting token limits
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentTokenCount = 0;

  for (const cluster of mergedClusters) {
    // Calculate token count for this cluster
    const clusterSentences = cluster.map((idx) => sentences[idx]);
    const clusterText = clusterSentences.join(" ");
    const clusterTokenCount = enc.encode(clusterText).length;

    // If this cluster fits in the current chunk, add it
    if (currentTokenCount + clusterTokenCount <= tokenLimit) {
      currentChunk.push(clusterText);
      currentTokenCount += clusterTokenCount;
    } else {
      // If cluster is too big on its own, split it further
      if (clusterTokenCount > tokenLimit) {
        // Need to break up the cluster
        let subChunk: string[] = [];
        let subChunkTokens = 0;

        for (const sentenceIdx of cluster) {
          const sentence = sentences[sentenceIdx];
          const sentenceTokens = enc.encode(sentence).length;

          if (subChunkTokens + sentenceTokens <= tokenLimit) {
            subChunk.push(sentence);
            subChunkTokens += sentenceTokens;
          } else {
            // Add completed sub-chunk
            if (subChunk.length > 0) {
              chunks.push(subChunk.join(" "));
              subChunk = [sentence];
              subChunkTokens = sentenceTokens;
            } else {
              // Single sentence exceeds token limit, need word-based splitting
              const words = sentence.split(/\s+/);
              let wordChunk: string[] = [];
              let wordChunkTokens = 0;

              for (const word of words) {
                const wordTokens = enc.encode(word + " ").length;
                if (wordChunkTokens + wordTokens <= tokenLimit) {
                  wordChunk.push(word);
                  wordChunkTokens += wordTokens;
                } else {
                  chunks.push(wordChunk.join(" "));
                  wordChunk = [word];
                  wordChunkTokens = wordTokens;
                }
              }

              if (wordChunk.length > 0) {
                chunks.push(wordChunk.join(" "));
              }
            }
          }
        }

        // Add any remaining sentences in the sub-chunk
        if (subChunk.length > 0) {
          chunks.push(subChunk.join(" "));
        }
      } else {
        // Current chunk is full, store it and start a new one with this cluster
        chunks.push(currentChunk.join(" "));
        currentChunk = [clusterText];
        currentTokenCount = clusterTokenCount;
      }
    }
  }

  // Add the last chunk if it exists
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(" "));
  }

  enc.free();
  return chunks;
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
  const chunks = await semanticChunking(fullText, CHUNK_TOKEN_LIMIT);
  console.log(`├── Created ${chunks.length} semantically chunked segments`);
  return chunks.flat();
};
