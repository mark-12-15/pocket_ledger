import Router from '@koa/router'
import { authMiddleware } from '../middleware/auth'
import pool from '../db'
import { parseWithGLM } from '../services/glm'
import path from 'path'
import fs from 'fs'

const router = new Router({ prefix: '/upload' })

router.use(authMiddleware)

// 上传文件（图片/PDF/音频），创建待解析的账单记录
router.post('/', async (ctx) => {
  const file = (ctx.request as any).files?.file
  if (!file) {
    ctx.status = 400
    ctx.body = { code: 400, message: '未上传文件' }
    return
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'audio/mpeg', 'audio/wav', 'audio/aac', 'audio/m4a']
  const mimeType: string = file.mimetype || ''
  if (!allowedTypes.includes(mimeType)) {
    ctx.status = 400
    ctx.body = { code: 400, message: '不支持的文件类型' }
    return
  }

  let inputMethod: number
  if (mimeType.startsWith('image/')) inputMethod = 2
  else if (mimeType === 'application/pdf') inputMethod = 3
  else inputMethod = 4

  // 将文件读取为 base64（TODO: 生产环境改为上传到腾讯云 COS，存储 URL）
  const fileBuffer = fs.readFileSync(file.filepath)
  const base64 = fileBuffer.toString('base64')
  const fileUrl = `data:${mimeType};base64,${base64}` // 临时方案，生产换 COS URL

  // 插入待解析记录
  const [result] = await pool.query(
    'INSERT INTO records (user_id, type, amount, happened_at, input_method, parse_status, raw_file_url) VALUES (?, 2, 0, CURDATE(), ?, 1, ?)',
    [ctx.state.userId, inputMethod, fileUrl]
  ) as any

  const recordId = result.insertId

  // 异步调用 GLM 解析（不阻塞响应）
  parseWithGLM(fileUrl, mimeType).then(async (parsed) => {
    if (parsed) {
      await pool.query(
        'UPDATE records SET type = ?, amount = ?, category = ?, note = ?, happened_at = ?, parse_status = 2, raw_text = ? WHERE id = ?',
        [parsed.type, parsed.amount, parsed.category, parsed.note, parsed.happened_at, parsed.rawText, recordId]
      )
    } else {
      await pool.query('UPDATE records SET parse_status = 3 WHERE id = ?', [recordId])
    }
  }).catch(async () => {
    await pool.query('UPDATE records SET parse_status = 3 WHERE id = ?', [recordId])
  })

  ctx.body = { code: 0, data: { id: recordId, message: '上传成功，正在解析中' } }
})

export default router
