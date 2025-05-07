import pdfExtractor from "./pdf-extractor";

// TODO: modify it to semantic chunks
export const chunk = async (file: string) => {
  const pages = await pdfExtractor.extractPDF(file);
  return pages.map((page) => `Page ${page.pageNumber}: ${page.text}`);
};
