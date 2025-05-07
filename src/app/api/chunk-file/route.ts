import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { chunk } from "@/lib/chunk";

export async function POST(request: NextRequest) {
  try {
    const { file } = await request.json();

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(file, "base64");
    const tmpDir = path.join(process.cwd(), "tmp");

    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir);
    }

    const tempFilePath = path.join(tmpDir, `temp-${Date.now()}.pdf`);
    fs.writeFileSync(tempFilePath, buffer);

    const fileUrl = `file://${tempFilePath}`;
    const chunks = await chunk(fileUrl);

    try {
      fs.unlinkSync(tempFilePath);
    } catch (cleanupError) {
      console.error("Error cleaning up temp file:", cleanupError);
    }

    return NextResponse.json({ chunks });
  } catch (error) {
    console.error("Error processing PDF with current method:", error);
    return NextResponse.json(
      { error: "Failed to process PDF with current method" },
      { status: 500 }
    );
  }
}
