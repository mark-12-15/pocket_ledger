import Koa from 'koa'
import cors from '@koa/cors'
import { koaBody } from 'koa-body'
import dotenv from 'dotenv'

import authRouter from './routes/auth'
import recordsRouter from './routes/records'
import uploadRouter from './routes/upload'

dotenv.config()

const app = new Koa()

app.use(cors())
app.use(koaBody({ multipart: true }))

// 统一错误处理
app.use(async (ctx, next) => {
  try {
    await next()
  } catch (err: any) {
    ctx.status = err.status || 500
    ctx.body = { code: ctx.status, message: err.message || '服务器错误' }
  }
})

app.use(authRouter.routes()).use(authRouter.allowedMethods())
app.use(recordsRouter.routes()).use(recordsRouter.allowedMethods())
app.use(uploadRouter.routes()).use(uploadRouter.allowedMethods())

const PORT = Number(process.env.PORT) || 3000
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
