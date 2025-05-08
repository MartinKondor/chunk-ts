import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { chunk as simpleChunking } from "@/lib/simple-chunking";
import { chunk as semanticChunking } from "@/lib/semantic-chunking";

export async function POST(request: NextRequest) {
  try {
    const { file, method } = await request.json();

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!method) {
      return NextResponse.json(
        { error: "No method provided" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(file, "base64");
    const tmpDir = path.join(process.cwd(), "tmp");

    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir);
    }

    const tempFilePath = path.join(tmpDir, `temp-${Date.now()}-v1.pdf`);
    fs.writeFileSync(tempFilePath, buffer);

    const fileUrl = `file://${tempFilePath}`;
    const chunks =
      method === "semantic"
        ? await semanticChunking(fileUrl)
        : await simpleChunking(fileUrl);

    try {
      fs.unlinkSync(tempFilePath);
    } catch (cleanupError) {
      console.error("Error cleaning up temp file:", cleanupError);
    }

    return NextResponse.json({ chunks });
  } catch (error) {
    console.error("Error processing PDF:", error);
    return NextResponse.json(
      { error: "Failed to process PDF" },
      { status: 500 }
    );
  }
}
