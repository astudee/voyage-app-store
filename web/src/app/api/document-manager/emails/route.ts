import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { google } from "googleapis";
import { Readable } from "stream";

const LABEL_NAME = "Vault";
const MAX_EMAILS_PER_RUN = 50;

function getGoogleAuth() {
  const serviceAccountKey = process.env.SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    throw new Error("SERVICE_ACCOUNT_KEY not configured");
  }

  const credentials = JSON.parse(serviceAccountKey);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/drive",
    ],
  });
}

function sanitizeFilename(text: string): string {
  if (!text) return "No_Subject";
  const clean = text.replace(/[^\w\-]+/g, "_");
  return clean.slice(0, 100);
}

function decodeBase64(data: string): Buffer {
  // Handle URL-safe base64
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64");
}

function getHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  const header = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return header?.value || "";
}

async function createEmailPdf(
  subject: string,
  sender: string,
  date: string,
  body: string
): Promise<Buffer> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 612; // Letter size
  const pageHeight = 792;
  const margin = 50;
  const lineHeight = 14;
  const maxWidth = pageWidth - 2 * margin;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  // Helper to add text and handle page breaks
  const addText = (text: string, fontSize: number, useFont: typeof font, color = rgb(0, 0, 0)) => {
    const words = text.split(" ");
    let line = "";

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      const width = useFont.widthOfTextAtSize(testLine, fontSize);

      if (width > maxWidth && line) {
        if (y < margin + lineHeight) {
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          y = pageHeight - margin;
        }
        page.drawText(line, { x: margin, y, size: fontSize, font: useFont, color });
        y -= lineHeight;
        line = word;
      } else {
        line = testLine;
      }
    }

    if (line) {
      if (y < margin + lineHeight) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      page.drawText(line, { x: margin, y, size: fontSize, font: useFont, color });
      y -= lineHeight;
    }
  };

  // Header
  addText(`From: ${sender}`, 10, font, rgb(0.2, 0.2, 0.2));
  addText(`Date: ${date}`, 10, font, rgb(0.2, 0.2, 0.2));
  addText(`Subject: ${subject}`, 10, boldFont, rgb(0.2, 0.2, 0.2));
  y -= 10; // Extra space after header

  // Body - split by newlines and paragraphs
  const lines = body.split("\n");
  for (const line of lines) {
    if (line.trim()) {
      addText(line.trim(), 11, font);
    } else {
      y -= lineHeight / 2; // Half line for empty lines
    }
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

export async function POST(_request: NextRequest) {
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

    const auth = getGoogleAuth();

    // Create delegated credentials for Gmail access
    const credentials = JSON.parse(process.env.SERVICE_ACCOUNT_KEY!);
    const jwtClient = new google.auth.JWT(
      credentials.client_email,
      undefined,
      credentials.private_key,
      [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.modify",
      ],
      "astudee@voyageadvisory.com" // Domain-wide delegation
    );

    const gmail = google.gmail({ version: "v1", auth: jwtClient });
    const drive = google.drive({ version: "v3", auth });

    // Get Vault label ID
    const labelsResponse = await gmail.users.labels.list({ userId: "me" });
    const vaultLabel = labelsResponse.data.labels?.find(
      (l) => l.name === LABEL_NAME
    );

    if (!vaultLabel?.id) {
      return NextResponse.json({
        success: true,
        processed: [],
        errors: [],
        message: "No 'Vault' label found",
      });
    }

    // Get messages with Vault label
    const messagesResponse = await gmail.users.messages.list({
      userId: "me",
      labelIds: [vaultLabel.id],
      maxResults: MAX_EMAILS_PER_RUN,
    });

    const messages = messagesResponse.data.messages || [];
    if (messages.length === 0) {
      return NextResponse.json({
        success: true,
        processed: [],
        errors: [],
        message: "No emails to process",
      });
    }

    const processed: Array<{ type: string; name: string; subject: string }> = [];
    const errors: string[] = [];

    for (const msg of messages) {
      if (!msg.id) continue;

      try {
        // Get full message
        const fullMessage = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "full",
        });

        const headers = fullMessage.data.payload?.headers || [];
        const subject = getHeader(headers, "Subject");
        const sender = getHeader(headers, "From");
        const dateStr = getHeader(headers, "Date");

        // Create timestamp for filename
        const internalDate = parseInt(fullMessage.data.internalDate || "0");
        const msgDate = new Date(internalDate);
        const timestamp = msgDate.toISOString().slice(0, 19).replace(/[T:]/g, "-").replace(/-/g, (m, i) => i < 10 ? "-" : "_");
        const subjectClean = sanitizeFilename(subject);

        // Get attachments
        const attachments: Array<{ filename: string; data: string; mimeType: string }> = [];
        const parts = fullMessage.data.payload?.parts || [];

        for (const part of parts) {
          if (part.filename && part.filename.length > 0) {
            // Skip inline images
            if (part.mimeType?.startsWith("image/")) continue;

            let attachmentData = part.body?.data;
            if (!attachmentData && part.body?.attachmentId) {
              const attachment = await gmail.users.messages.attachments.get({
                userId: "me",
                messageId: msg.id,
                id: part.body.attachmentId,
              });
              attachmentData = attachment.data.data || undefined;
            }

            if (attachmentData) {
              attachments.push({
                filename: part.filename,
                data: attachmentData,
                mimeType: part.mimeType || "application/octet-stream",
              });
            }
          }
        }

        if (attachments.length > 0) {
          // Save attachments
          for (const att of attachments) {
            const filename = `ATTACH_${timestamp}_${sanitizeFilename(att.filename)}`;
            const fileContent = decodeBase64(att.data);

            await drive.files.create({
              requestBody: {
                name: filename,
                parents: [toFileFolderId],
              },
              media: {
                mimeType: att.mimeType,
                body: Readable.from(fileContent),
              },
              supportsAllDrives: true,
            });

            processed.push({ type: "Attachment", name: filename, subject });
          }
        } else {
          // Convert email to PDF
          let body = "";
          const payload = fullMessage.data.payload;

          if (payload?.parts) {
            const textPart = payload.parts.find((p) => p.mimeType === "text/plain");
            if (textPart?.body?.data) {
              body = decodeBase64(textPart.body.data).toString("utf-8");
            }
          } else if (payload?.body?.data) {
            body = decodeBase64(payload.body.data).toString("utf-8");
          }

          const pdfContent = await createEmailPdf(subject, sender, dateStr, body);
          const filename = `EMAIL_${timestamp}_${subjectClean}.pdf`;

          await drive.files.create({
            requestBody: {
              name: filename,
              parents: [toFileFolderId],
            },
            media: {
              mimeType: "application/pdf",
              body: Readable.from(pdfContent),
            },
            supportsAllDrives: true,
          });

          processed.push({ type: "Email PDF", name: filename, subject });
        }

        // Remove Vault label
        await gmail.users.messages.modify({
          userId: "me",
          id: msg.id,
          requestBody: {
            removeLabelIds: [vaultLabel.id],
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        errors.push(`Message ${msg.id}: ${message}`);
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      errors,
      message: `Processed ${processed.length} items`,
    });
  } catch (error) {
    console.error("Email processing error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
