import archiver from 'archiver';
import { Readable } from 'stream';

/**
 * Creates a ZIP archive from an array of files
 * Optimized for large archives (up to 250 files)
 */
export async function createZip(
  files: { filename: string; content: Buffer }[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Set a timeout for very large archives (5 minutes)
    const timeout = setTimeout(() => {
      reject(new Error('ZIP creation timeout: Archive is too large or taking too long'));
    }, 300000); // 5 minutes

    const chunks: Buffer[] = [];
    let totalSize = 0;
    const maxSize = 500 * 1024 * 1024; // 500MB limit

    const archive = archiver('zip', {
      zlib: { level: 6 }, // Balanced compression (level 9 is too slow for large files)
      store: false, // Use compression
    });

    // Track memory usage
    archive.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      totalSize += chunk.length;
      
      // Safety check for very large archives
      if (totalSize > maxSize) {
        clearTimeout(timeout);
        reject(new Error(`ZIP archive exceeds maximum size limit (${maxSize / 1024 / 1024}MB)`));
      }
    });

    // Handle errors
    archive.on('error', (err: Error) => {
      clearTimeout(timeout);
      reject(err);
    });

    // Resolve when archive is finalized
    archive.on('end', () => {
      clearTimeout(timeout);
      try {
        const buffer = Buffer.concat(chunks);
        resolve(buffer);
      } catch (err) {
        reject(new Error(`Failed to concatenate ZIP chunks: ${err instanceof Error ? err.message : 'Unknown error'}`));
      }
    });

    // Add files to archive with error handling
    try {
      files.forEach((file, index) => {
        if (!file.filename || !file.content) {
          console.warn(`Skipping invalid file at index ${index}`);
          return;
        }
        
        // Validate filename
        const sanitizedFilename = file.filename.replace(/[<>:"/\\|?*]/g, '_');
        
        archive.append(file.content, { name: sanitizedFilename });
      });

      // Finalize the archive
      archive.finalize();
    } catch (err) {
      clearTimeout(timeout);
      reject(new Error(`Failed to add files to archive: ${err instanceof Error ? err.message : 'Unknown error'}`));
    }
  });
}

