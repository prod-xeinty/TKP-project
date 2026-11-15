import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

interface ZipEntry {
  relPath: string;
  data: Buffer;
}

const INCLUDED_ROOT_FILES = [
  'package.json',
  '.npmrc',
  'tsconfig.json',
  'vite.config.ts',
  'index.html',
  '.env.example',
  '.gitignore',
  'metadata.json',
  'server.ts',
];

const INCLUDED_DIRS = ['src', 'server'];

function collectFilesRecursive(baseDir: string, currentDir: string, entries: ZipEntry[]) {
  const fullDir = path.join(baseDir, currentDir);
  if (!fs.existsSync(fullDir)) return;

  for (const item of fs.readdirSync(fullDir, { withFileTypes: true })) {
    const rel = path.posix.join(currentDir.replace(/\\/g, '/'), item.name);
    const abs = path.join(fullDir, item.name);
    if (item.isDirectory()) {
      collectFilesRecursive(baseDir, rel, entries);
    } else if (item.isFile()) {
      entries.push({
        relPath: rel,
        data: fs.readFileSync(abs),
      });
    }
  }
}

/**
 * Собирает стандартный ZIP-архив со всеми исходными файлами проекта
 * без внешних зависимостей (использует встроенный модуль Node.js zlib).
 */
export function buildProjectSourceZip(rootDir: string): Buffer {
  const entries: ZipEntry[] = [];

  for (const fileName of INCLUDED_ROOT_FILES) {
    const abs = path.join(rootDir, fileName);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      entries.push({
        relPath: fileName,
        data: fs.readFileSync(abs),
      });
    }
  }

  for (const dirName of INCLUDED_DIRS) {
    collectFilesRecursive(rootDir, dirName, entries);
  }

  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.relPath, 'utf-8');
    const uncompressed = entry.data;
    const compressed = zlib.deflateRawSync(uncompressed);
    const crc = zlib.crc32(uncompressed) >>> 0;

    // Local file header (30 bytes + filename)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 flag
    localHeader.writeUInt16LE(8, 8); // compression method: deflate
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0x5821, 12); // mod date
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(uncompressed.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra length

    localParts.push(localHeader, nameBuf, compressed);

    // Central directory header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // signature
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0x0800, 8); // UTF-8 flag
    centralHeader.writeUInt16LE(8, 10); // deflate
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0x5821, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(uncompressed.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra
    centralHeader.writeUInt16LE(0, 32); // comment
    centralHeader.writeUInt16LE(0, 34); // disk
    centralHeader.writeUInt16LE(0, 36); // internal attr
    centralHeader.writeUInt32LE(0, 38); // external attr
    centralHeader.writeUInt32LE(offset, 42); // local header offset

    centralParts.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralDirBuffer = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirBuffer, eocd]);
}
