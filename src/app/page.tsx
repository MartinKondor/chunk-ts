"use client";

import { useState } from "react";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [chunks, setChunks] = useState<string[]>([]);
  const [chunksV1, setChunksV1] = useState<string[]>([]);
  const [error, setError] = useState<string>("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type !== "application/pdf") {
        setError("Only PDF files are allowed");
        setFile(null);
        e.target.value = "";
      } else {
        setError("");
        setFile(selectedFile);
      }
    }
  };

  const handleUpload = async () => {
    if (!file) {
      return;
    }

    setChunks([]);
    setChunksV1([]);
    setIsUploading(true);
    setError("");

    try {
      const base64File = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64String = reader.result as string;
          resolve(base64String.split(",")[1]);
        };
        reader.readAsDataURL(file);
      });

      const response = await fetch("/api/chunk-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: base64File, method: "semantic" }),
      });

      if (!response.ok) {
        throw new Error("Failed to process file");
      }

      const data = await response.json();
      setChunks(data.chunks);

      const responseV1 = await fetch("/api/chunk-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: base64File, method: "simple" }),
      });

      if (!responseV1.ok) {
        throw new Error("Failed to process file with method 2");
      }

      const dataV1 = await responseV1.json();
      setChunksV1(dataV1.chunks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-12 max-w-6xl">
        <h1 className="text-3xl font-bold mb-8 text-center text-gray-800 dark:text-white">
          PDF Chunking Comparison
        </h1>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-10 transition-all duration-300 hover:shadow-xl">
          <div className="flex flex-col sm:flex-row gap-6 items-start mb-4">
            <div className="flex-1 w-full">
              <label className="block mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                Upload PDF (Max 10MB)
              </label>
              <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 hover:border-blue-500 dark:hover:border-blue-400 transition-colors duration-200">
                <input
                  type="file"
                  onChange={handleFileChange}
                  accept=".pdf"
                  className="block w-full text-sm text-gray-900 cursor-pointer bg-transparent dark:text-gray-400 focus:outline-none"
                />
              </div>
              {error && (
                <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}
            </div>

            <button
              onClick={handleUpload}
              disabled={!file || isUploading}
              className="px-6 py-3 text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-md hover:shadow-lg"
            >
              {isUploading ? (
                <div className="flex items-center">
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Processing...
                </div>
              ) : (
                "Process PDF"
              )}
            </button>
          </div>

          {file && (
            <div className="text-sm text-gray-600 dark:text-gray-400 mt-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="flex items-center">
                <svg
                  className="w-5 h-5 mr-2 text-gray-500 dark:text-gray-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    fillRule="evenodd"
                    d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                    clipRule="evenodd"
                  ></path>
                </svg>
                <span className="font-medium">{file.name}</span>
                <span className="ml-2 text-gray-500">
                  ({(file.size / 1024 / 1024).toFixed(2)} MB)
                </span>
              </div>
            </div>
          )}
        </div>

        {isUploading && (
          <div className="text-center py-8">
            <div className="inline-flex items-center px-4 py-2 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full">
              <svg
                className="animate-spin -ml-1 mr-3 h-5 w-5"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              <span>Processing your PDF...</span>
            </div>
            <p className="mt-3 text-gray-600 dark:text-gray-400">
              This may take a moment depending on the file size
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* First chunking method results */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transition-all duration-300 hover:shadow-xl border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold mb-4 pb-2 border-b border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white">
              Semantic Chunking
            </h2>
            {chunks.length > 0 ? (
              <div className="space-y-4 pr-2">
                {chunks.map((chunk, index) => (
                  <div
                    key={index}
                    className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-700 shadow-sm hover:shadow-md transition-all duration-200"
                  >
                    <div className="font-bold mb-2 text-blue-600 dark:text-blue-400">
                      Chunk {index + 1}
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm text-gray-700 dark:text-gray-300">
                      {chunk}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  ></path>
                </svg>
                <p className="mt-4 text-gray-500 dark:text-gray-400">
                  No chunks to display. Upload a PDF to see results.
                </p>
              </div>
            )}
          </div>

          {/* Second chunking method results */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transition-all duration-300 hover:shadow-xl border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold mb-4 pb-2 border-b border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white">
              Simple Chunking
            </h2>
            {chunksV1.length > 0 ? (
              <div className="space-y-4 pr-2">
                {chunksV1.map((chunk, index) => (
                  <div
                    key={index}
                    className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-700 shadow-sm hover:shadow-md transition-all duration-200"
                  >
                    <div className="font-bold mb-2 text-blue-600 dark:text-blue-400">
                      Chunk {index + 1}
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm text-gray-700 dark:text-gray-300">
                      {chunk}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  ></path>
                </svg>
                <p className="mt-4 text-gray-500 dark:text-gray-400">
                  No chunks to display. Upload a PDF to see results.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
