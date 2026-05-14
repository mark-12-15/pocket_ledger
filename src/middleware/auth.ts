import { Context, Next } from 'koa'
import jwt from 'jsonwebtoken'

export async function authMiddleware(ctx: Context, next: Next) {
  const token = ctx.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    ctx.status = 401
    ctx.body = { code: 401, message: '未登录' }
    return
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: number }
    ctx.state.userId = payload.userId
    await next()
  } catch {
    ctx.status = 401
    ctx.body = { code: 401, message: 'token 已过期或无效' }
  }
}
