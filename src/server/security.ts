import type { Request, Response, NextFunction } from 'express';
import sharp from 'sharp';

export function localRequestGuard(req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const host = req.get('host');
  const allowed = new Set(['localhost', '127.0.0.1', '[::1]', ...(process.env.APP_ALLOWED_HOSTS || '').split(',').filter(Boolean)]);
  try {
    if (!host || !allowed.has(new URL('http://' + host).hostname)) {
      return res.status(403).json({error:'工作台仅允许已配置的本地访问地址。'});
    }
    const origin = req.headers.origin;
    if (origin) {
      const source = new URL(origin);
      const dev = (process.env.APP_ALLOWED_ORIGINS || '').split(',').filter(Boolean);
      if (!['http:', 'https:'].includes(source.protocol) || (source.host !== host && !dev.includes(source.origin))) {
        return res.status(403).json({error:'不允许此来源访问本地工作台'});
      }
    }
    next();
  } catch {
    return res.status(403).json({error:'无效访问来源'});
  }
}

export async function decodeUpload(bytes: unknown) {
  if (!Buffer.isBuffer(bytes) || !bytes.length) throw new Error('只接受 PNG/JPEG 图片');
  try {
    const decoder = sharp(bytes, {limitInputPixels:24_000_000, failOn:'warning'});
    const info = await decoder.metadata();
    if (!['png','jpeg'].includes(info.format || '') || !info.width || !info.height || (info.pages || 1) !== 1) throw new Error('Unsupported image');
    const normalized = await decoder.rotate().png().toBuffer();
    if (normalized.length > 32*1024*1024) throw new Error('Decoded image too large');
    return normalized;
  } catch {
    throw new Error('图片无法完整解码；请上传不超过 2400 万像素的有效 PNG/JPEG 静态图片。');
  }
}
