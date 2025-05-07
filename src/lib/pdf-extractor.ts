import Pdf2JsonPdfExtractor from "./pdf2json-pdf-extractor";

export enum PageChunkType {
  TEXT = "TEXT",
  TABLE = "TABLE",
}

export interface PageChunks {
  text: string;
  type: PageChunkType;
}

export interface PageText {
  pageNumber: number;
  text: string;
  chunks?: PageChunks[];
}

export interface PdfExtractor {
  extractPDF(docUrl: string): Promise<PageText[]>;
}

const pdfExtractorFactory = (): PdfExtractor => {
  return new Pdf2JsonPdfExtractor();
};

export default pdfExtractorFactory();
