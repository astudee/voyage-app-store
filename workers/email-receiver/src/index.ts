import PostalMime from 'postal-mime';

export interface Env {
  VOYAGE_DOCUMENTS: R2Bucket;
  API_URL: string;
  API_SECRET: string;
}

// Generate a 10-character alphanumeric NanoID
function generateNanoId(): string {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let id = '';
  for (let i = 0; i < 10; i++) {
    id += alphabet[bytes[i] % alphabet.length];
  }
  return id;
}

// Create a simple PDF from text content
function createSimplePdf(subject: string, from: string, date: string, body: string): Uint8Array {
  // Clean and prepare text
  const cleanBody = body
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .slice(0, 10000); // Limit size

  // Split into lines (max ~80 chars per line for PDF)
  const lines: string[] = [];
  lines.push(`From: ${from}`);
  lines.push(`Date: ${date}`);
  lines.push(`Subject: ${subject}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Word wrap the body
  const words = cleanBody.split(/\s+/);
  let currentLine = '';
  for (const word of words) {
    if (currentLine.length + word.length + 1 > 80) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = currentLine ? currentLine + ' ' + word : word;
    }
  }
  if (currentLine) lines.push(currentLine);

  // Build PDF content
  const pdfLines = lines.map((line, i) => {
    // Escape special PDF characters
    const escaped = line
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
    return `BT /F1 10 Tf 50 ${750 - i * 14} Td (${escaped}) Tj ET`;
  }).join('\n');

  const content = `1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj

2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj

3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj

4 0 obj
<< /Length ${pdfLines.length} >>
stream
${pdfLines}
endstream
endobj

5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj

xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000266 00000 n
0000000${(340 + pdfLines.length).toString().padStart(3, '0')} 00000 n

trailer
<< /Size 6 /Root 1 0 R >>
startxref
${400 + pdfLines.length}
%%EOF`;

  return new TextEncoder().encode('%PDF-1.4\n' + content);
}

// Sanitize filename for storage
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 200);
}

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('=== Voyage Email Receiver ===');
    console.log(`From: ${message.from}`);
    console.log(`To: ${message.to}`);
    console.log(`Subject: ${message.headers.get('subject') || '(no subject)'}`);

    try {
      // Get raw email as ArrayBuffer
      // message.raw is a ReadableStream, not a function!
      const rawEmail = await new Response(message.raw).arrayBuffer();
      console.log(`Raw email size: ${rawEmail.byteLength} bytes`);

      // Parse email with postal-mime
      const parser = new PostalMime();
      const parsed = await parser.parse(rawEmail);

      console.log(`Parsed email - attachments: ${parsed.attachments?.length || 0}`);

      const subject = parsed.subject || '(no subject)';
      const fromAddress = message.from;
      const dateStr = new Date().toISOString();

      // Find PDF attachments
      const pdfAttachments = (parsed.attachments || []).filter(
        att => att.mimeType === 'application/pdf' ||
               att.filename?.toLowerCase().endsWith('.pdf')
      );

      console.log(`Found ${pdfAttachments.length} PDF attachment(s)`);

      const uploads: { id: string; filename: string; filePath: string; fileSize: number }[] = [];

      if (pdfAttachments.length > 0) {
        // Upload each PDF attachment
        for (const attachment of pdfAttachments) {
          const id = generateNanoId();
          const originalFilename = attachment.filename || `attachment_${id}.pdf`;
          const sanitizedFilename = sanitizeFilename(originalFilename);
          const filePath = `import/${id}.pdf`;

          console.log(`Uploading PDF: ${originalFilename} -> ${filePath}`);

          // Upload to R2
          await env.VOYAGE_DOCUMENTS.put(filePath, attachment.content, {
            httpMetadata: {
              contentType: 'application/pdf',
            },
            customMetadata: {
              originalFilename: originalFilename,
              emailFrom: fromAddress,
              emailSubject: subject,
            },
          });

          uploads.push({
            id,
            filename: originalFilename,
            filePath,
            fileSize: attachment.content.byteLength,
          });
        }
      } else {
        // No PDF attachments - convert email body to PDF
        console.log('No PDF attachments found, creating PDF from email body');

        const id = generateNanoId();
        const body = parsed.text || parsed.html?.replace(/<[^>]*>/g, ' ') || '(empty email)';
        const pdfContent = createSimplePdf(subject, fromAddress, dateStr, body);
        const filePath = `import/${id}.pdf`;
        const filename = `email_${subject.slice(0, 50).replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

        console.log(`Creating PDF from email body: ${filePath}`);

        // Upload to R2
        await env.VOYAGE_DOCUMENTS.put(filePath, pdfContent, {
          httpMetadata: {
            contentType: 'application/pdf',
          },
          customMetadata: {
            originalFilename: filename,
            emailFrom: fromAddress,
            emailSubject: subject,
          },
        });

        uploads.push({
          id,
          filename,
          filePath,
          fileSize: pdfContent.byteLength,
        });
      }

      // Call API for each uploaded file
      for (const upload of uploads) {
        console.log(`Calling API for document: ${upload.id}`);

        const apiUrl = `${env.API_URL}/api/documents-v2/from-email`;
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.API_SECRET}`,
          },
          body: JSON.stringify({
            id: upload.id,
            filename: upload.filename,
            filePath: upload.filePath,
            fileSize: upload.fileSize,
            source: 'email',
            sourceEmailFrom: fromAddress,
            sourceEmailSubject: subject,
          }),
        });

        const result = await response.text();
        console.log(`API response for ${upload.id}: ${response.status} - ${result}`);

        if (!response.ok) {
          console.error(`API call failed for ${upload.id}: ${response.status}`);
        }
      }

      console.log(`Successfully processed email with ${uploads.length} file(s)`);

    } catch (error) {
      console.error('Error processing email:', error);
      throw error;
    }
  },
};
