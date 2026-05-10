// src/core/migrate/utils.ts
// 共享 helper — Plan 8c 抽离自 sources/openspec.ts(P2)

import { promises as fsPromises } from 'node:fs';

// 编码探测：读前 4 字节识别 UTF-8 / BOM / 非 UTF-8
export async function detectEncoding(absPath: string): Promise<'utf8' | 'utf8-bom' | 'non-utf8'> {
  try {
    const buf = Buffer.alloc(4);
    const fh = await fsPromises.open(absPath, 'r');
    const { bytesRead } = await fh.read(buf, 0, 4, 0);
    await fh.close();

    if (bytesRead >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return 'utf8-bom';
    if (bytesRead >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return 'non-utf8'; // UTF-16-LE BOM
    if (bytesRead >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return 'non-utf8'; // UTF-16-BE BOM
    // 简单启发：含 0x00 字节多半是 UTF-16
    for (let i = 0; i < bytesRead; i++) {
      if (buf[i] === 0x00) return 'non-utf8';
    }
    return 'utf8';
  } catch {
    return 'utf8'; // 打开失败默认 utf8
  }
}
