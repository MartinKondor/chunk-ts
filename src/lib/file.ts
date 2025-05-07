import * as fs from "fs";
import * as path from "path";

export const downloadFileToTmp = async (url: string) => {
  try {
    if (url.startsWith("file://")) {
      const filePath = url.replace("file://", "");
      if (fs.existsSync(filePath)) {
        return filePath;
      } else {
        throw new Error(`Local file not found: ${filePath}`);
      }
    }

    const response = await fetch(url);
    const extension = url.split(".").pop();
    const fileName = `${Math.random()
      .toString(36)
      .substring(2, 20)}.${extension}`;

    if (!response.ok) {
      throw new Error(
        `Request failed with ${response.status} ${response.statusText}`
      );
    }

    if (!response.body) {
      throw new Error("Empty response body");
    }

    const tmpDir = path.join(process.cwd(), "tmp");
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir);
    }
    const filePath = path.join(tmpDir, fileName);
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(buffer));
    return filePath;
  } catch (error) {
    console.error("Error downloading file", error);
    throw error;
  }
};

export const deleteFileFromTmp = (filePath: string) => {
  fs.unlinkSync(filePath);
};
