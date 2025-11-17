import archiver from 'archiver';
import { Readable } from 'stream';

/**
 * Creates a ZIP archive from an array of files
 */
export async function createZip(
  files: { filename: string; content: Buffer }[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const archive = archiver('zip', {
      zlib: { level: 9 }, // Maximum compression
    });

    // Collect data chunks
    archive.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    // Handle errors
    archive.on('error', (err: Error) => {
      reject(err);
    });

    // Resolve when archive is finalized
    archive.on('end', () => {
      const buffer = Buffer.concat(chunks);
      resolve(buffer);
    });

    // Add files to archive
    files.forEach((file) => {
      archive.append(file.content, { name: file.filename });
    });

    // Finalize the archive
    archive.finalize();
  });
}

