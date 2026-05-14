import Router from '@koa/router'
import { authMiddleware } from '../middleware/auth'
import pool from '../db'
import { parseWithGLM } from '../services/glm'
import { uploadFile } from '../services/storage'
import fs from 'fs'
import sharp from 'sharp'
import pdfParse from 'pdf-parse'
import path from 'path'

const router = new Router({ prefix: '/upload' })

router.use(authMiddleware)

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'audio/mpeg', 'audio/wav', 'audio/aac', 'audio/m4a']

// 上传文件（图片/PDF/音频），创建待解析的账单记录
router.post('/', async (ctx) => {
  const file = (ctx.request as any).files?.file
  if (!file) {
    ctx.status = 400
    ctx.body = { code: 400, message: '未上传文件' }
    return
  }

  const mimeType: string = file.mimetype || ''
  if (!ALLOWED_TYPES.includes(mimeType)) {
    ctx.status = 400
    ctx.body = { code: 400, message: '不支持的文件类型' }
    return
  }

  let inputMethod: number
  if (mimeType.startsWith('image/')) inputMethod = 2
  else if (mimeType === 'application/pdf') inputMethod = 3
  else inputMethod = 4

  const rawBuffer = fs.readFileSync(file.filepath)
  const userId = ctx.state.userId
  const timestamp = Date.now()

  let fileBuffer: Buffer
  let ext: string
  let glmInput: string  // 传给 GLM 的内容：图片 base64 URL 或 PDF 提取的文本

  if (mimeType.startsWith('image/')) {
    // 压缩图片：最大 1920px，转 webp，质量 80
    fileBuffer = await sharp(rawBuffer)
      .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer()
    ext = 'webp'
    glmInput = `data:image/webp;base64,${fileBuffer.toString('base64')}`
  } else if (mimeType === 'application/pdf') {
    fileBuffer = rawBuffer
    ext = 'pdf'
    // 提取 PDF 文本传给 GLM
    const pdfData = await pdfParse(rawBuffer)
    glmInput = pdfData.text
  } else {
    fileBuffer = rawBuffer
    ext = path.extname(file.originalFilename || file.newFilename || 'audio').replace('.', '') || 'm4a'
    glmInput = `data:${mimeType};base64,${fileBuffer.toString('base64')}`
  }

  // 上传到 CloudBase 存储
  const cloudPath = `records/${userId}/${timestamp}.${ext}`
  const fileUrl = await uploadFile(fileBuffer, cloudPath)

  // 插入待解析记录
  const [result] = await pool.query(
    'INSERT INTO records (user_id, type, amount, happened_at, input_method, parse_status, raw_file_url) VALUES (?, 2, 0, CURDATE(), ?, 1, ?)',
    [userId, inputMethod, fileUrl]
  ) as any

  const recordId = result.insertId

  // 异步调用 GLM 解析（不阻塞响应）
  parseWithGLM(glmInput, mimeType.startsWith('image/') ? 'image/webp' : mimeType).then(async (parsed) => {
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
