/* eslint-disable @typescript-eslint/no-explicit-any */
import { deleteFileFromTmp, downloadFileToTmp } from "./file";
import PDFParser from "pdf2json";

import { PageText, PdfExtractor } from "./pdf-extractor";

class Pdf2JsonPdfExtractor implements PdfExtractor {
  async extractPDF(docUrl: string): Promise<PageText[]> {
    let fileTmpPath: string | null = null;
    try {
      fileTmpPath = await downloadFileToTmp(docUrl);
      const pages = await this.extractLocalPDF(fileTmpPath);
      return pages;
    } catch (error) {
      console.error("Error extracting PDF:", error);
      throw error;
    } finally {
      // Only delete if it's not already a local file (file:// protocol)
      if (fileTmpPath && !docUrl.startsWith("file://")) {
        try {
          deleteFileFromTmp(fileTmpPath);
        } catch (error) {
          console.error("Error deleting temporary file:", error);
        }
      }
    }
  }

  /**
   * Extracts text content from each page of a PDF file using pdf2json.
   * @param filePath - Path to the PDF file.
   * @returns A promise that resolves to an array of PageText objects.
   */
  async extractLocalPDF(filePath: string): Promise<PageText[]> {
    return new Promise((resolve, reject) => {
      const pdfParser = new PDFParser();

      pdfParser.on("pdfParser_dataError", (errData: { parserError: any }) => {
        console.error("Error extracting text per page:", errData.parserError);
        reject(errData.parserError);
      });

      pdfParser.on("pdfParser_dataReady", (pdfData: { Pages: any[] }) => {
        try {
          const pagesText: PageText[] = pdfData.Pages.map(
            (page: any, index: number) => {
              const pageText = page.Texts.map((text: any) => {
                return decodeURIComponent(text.R[0].T);
              }).join(" ");
              return { pageNumber: index + 1, text: pageText };
            }
          );
          resolve(pagesText);
        } catch (error) {
          console.error("Error processing PDF data:", error);
          reject(error);
        }
      });

      try {
        pdfParser.loadPDF(filePath);
      } catch (error) {
        console.error("Error loading PDF:", error);
        reject(error);
      }
    });
  }
}

export default Pdf2JsonPdfExtractor;
