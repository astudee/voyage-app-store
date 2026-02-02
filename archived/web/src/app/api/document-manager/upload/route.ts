import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { google } from "googleapis";
import { Readable } from "stream";

function getGoogleAuth() {
  const serviceAccountKey = process.env.SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    throw new Error("SERVICE_ACCOUNT_KEY not configured");
  }

  const credentials = JSON.parse(serviceAccountKey);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const toFileFolderId = process.env.FOLDER_TO_FILE;
    if (!toFileFolderId) {
      return NextResponse.json(
        { error: "FOLDER_TO_FILE not configured" },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "No files provided" },
        { status: 400 }
      );
    }

    const auth = getGoogleAuth();
    const drive = google.drive({ version: "v3", auth });

    const uploaded: Array<{ name: string; id: string }> = [];
    const errors: string[] = [];

    for (const file of files) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const response = await drive.files.create({
          requestBody: {
            name: file.name,
            parents: [toFileFolderId],
          },
          media: {
            mimeType: file.type || "application/octet-stream",
            body: Readable.from(buffer),
          },
          supportsAllDrives: true,
        });

        if (response.data.id) {
          uploaded.push({ name: file.name, id: response.data.id });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        errors.push(`${file.name}: ${message}`);
      }
    }

    return NextResponse.json({
      success: true,
      uploaded,
      errors,
      message: `Uploaded ${uploaded.length} files to 'to file' folder`,
    });
  } catch (error) {
    console.error("Upload error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
