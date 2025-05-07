import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { file } = await request.json();

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // TODO: Implement actual PDF chunking logic
    // For now, just return dummy chunks
    const chunks = [
      "This is the first chunk",
      "This is the second chunk",
      "This is the third chunk",
    ];

    return NextResponse.json({ chunks });
  } catch (error) {
    console.error("Error processing PDF:", error);
    return NextResponse.json(
      { error: "Failed to process PDF" },
      { status: 500 }
    );
  }
}
