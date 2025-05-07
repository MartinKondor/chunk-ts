"use client";

import { useState } from "react";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [chunks, setChunks] = useState<string[]>([]);
  const [chunksV1, setChunksV1] = useState<string[]>([]);
  const [error, setError] = useState("");

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
    if (!file) return;

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
        body: JSON.stringify({ file: base64File }),
      });

      if (!response.ok) {
        throw new Error("Failed to process file");
      }

      const data = await response.json();
      setChunks(data.chunks);

      const responseV1 = await fetch("/api/chunk-file-v1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: base64File }),
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
    <div className="min-h-screen p-6">
      <h1 className="text-2xl font-bold mb-6">PDF Chunking Comparison</h1>

      <div className="mb-8">
        <div className="flex flex-col sm:flex-row gap-4 items-start mb-4">
          <div className="flex-1">
            <label className="block mb-2 text-sm font-medium">
              Upload PDF (Max 10MB)
            </label>
            <input
              type="file"
              onChange={handleFileChange}
              accept=".pdf"
              className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 dark:text-gray-400 focus:outline-none dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400"
            />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </div>

          <button
            onClick={handleUpload}
            disabled={!file || isUploading}
            className="px-4 py-2 text-white bg-blue-700 rounded-lg hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUploading ? "Processing..." : "Process PDF"}
          </button>
        </div>

        {file && (
          <div className="text-sm text-gray-500">
            Selected file: {file.name} ({(file.size / 1024 / 1024).toFixed(2)}{" "}
            MB)
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* First chunking method results */}
        <div className="border rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-4">
            Default Chunking Method
          </h2>
          {chunks.length > 0 ? (
            <div className="space-y-4">
              {chunks.map((chunk, index) => (
                <div
                  key={index}
                  className="border rounded p-3 bg-gray-50 dark:bg-gray-800"
                >
                  <div className="font-medium mb-1">Chunk {index + 1}</div>
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {chunk}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">
              No chunks to display. Upload a PDF to see results.
            </p>
          )}
        </div>

        {/* Second chunking method results */}
        <div className="border rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-4">
            Alternative Chunking Method
          </h2>
          {chunksV1.length > 0 ? (
            <div className="space-y-4">
              {chunksV1.map((chunk, index) => (
                <div
                  key={index}
                  className="border rounded p-3 bg-gray-50 dark:bg-gray-800"
                >
                  <div className="font-medium mb-1">Chunk {index + 1}</div>
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {chunk}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">
              No chunks to display. Upload a PDF to see results.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
