import { Context, Next } from 'koa'
import jwt from 'jsonwebtoken'

export async function authMiddleware(ctx: Context, next: Next) {
  const authHeader = ctx.headers.authorization
  console.log(`[auth] ${ctx.method} ${ctx.path} | Authorization: ${authHeader ? authHeader.slice(0, 30) + '...' : 'MISSING'}`)
  const token = authHeader?.replace('Bearer ', '')
  if (!token) {
    ctx.status = 401
    ctx.body = { code: 401, message: '未登录' }
    return
  }
  let payload: { userId: number }
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: number }
  } catch (err: any) {
    console.log(`[auth] jwt verify failed: ${err.message} | token prefix: ${token.slice(0, 30)}`)
    ctx.status = 401
    ctx.body = { code: 401, message: 'token 已过期或无效' }
    return
  }
  ctx.state.userId = payload.userId
  await next()
}
