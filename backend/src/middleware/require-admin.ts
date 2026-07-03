import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types.js';

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (c.var.role !== 'admin') {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  await next();
});
