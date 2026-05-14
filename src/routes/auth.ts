import Router from '@koa/router'
import axios from 'axios'
import jwt from 'jsonwebtoken'
import pool from '../db'
import { authMiddleware } from '../middleware/auth'

const router = new Router({ prefix: '/auth' })

// 获取当前用户信息
router.get('/profile', authMiddleware, async (ctx) => {
  const [rows] = await pool.query(
    'SELECT id, openid, phone, nickname, created_at FROM users WHERE id = ?',
    [ctx.state.userId]
  ) as any[]
  if ((rows as any[]).length === 0) {
    ctx.status = 404
    ctx.body = { code: 404, message: '用户不存在' }
    return
  }
  ctx.body = { code: 0, data: (rows as any[])[0] }
})

// 修改用户信息
router.put('/profile', authMiddleware, async (ctx) => {
  const { nickname } = ctx.request.body as { nickname?: string }
  if (!nickname) {
    ctx.status = 400
    ctx.body = { code: 400, message: 'nickname 不能为空' }
    return
  }
  await pool.query('UPDATE users SET nickname = ? WHERE id = ?', [nickname, ctx.state.userId])
  ctx.body = { code: 0, message: '更新成功' }
})

// 微信小程序登录
router.post('/wx-login', async (ctx) => {
  const { code } = ctx.request.body as { code: string }
  if (!code) {
    ctx.status = 400
    ctx.body = { code: 400, message: 'code 不能为空' }
    return
  }

  const { data } = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
    params: {
      appid: process.env.WX_APPID,
      secret: process.env.WX_SECRET,
      js_code: code,
      grant_type: 'authorization_code',
    },
  })

  if (data.errcode) {
    // 开发环境：模拟器 code 无法通过微信校验，用 code 作为测试 openid
    if (process.env.NODE_ENV !== 'production') {
      data.openid = `dev_${code}`
    } else {
      ctx.status = 400
      ctx.body = { code: 400, message: '微信登录失败', detail: data.errmsg }
      return
    }
  }

  const { openid } = data
  const [rows] = await pool.query('SELECT id, phone, nickname FROM users WHERE openid = ?', [openid])
  const users = rows as any[]

  let userId: number
  let isNewUser = false

  if (users.length === 0) {
    const [result] = await pool.query('INSERT INTO users (openid) VALUES (?)', [openid]) as any
    userId = result.insertId
    isNewUser = true
  } else {
    userId = users[0].id
  }

  const token = jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: '30d' })
  ctx.body = {
    code: 0,
    data: {
      token,
      isNewUser,
      user: users[0] || { id: userId, phone: null, nickname: null },
    },
  }
})

// 绑定手机号（小程序端，微信加密手机号解密方案另行处理，此处接收明文手机号+验证码）
router.post('/bind-phone', async (ctx) => {
  const { phone, smsCode } = ctx.request.body as { phone: string; smsCode: string }
  if (!phone || !smsCode) {
    ctx.status = 400
    ctx.body = { code: 400, message: '参数不完整' }
    return
  }

  const [codeRows] = await pool.query(
    'SELECT id FROM sms_codes WHERE phone = ? AND code = ? AND used = 0 AND expired_at > NOW() ORDER BY id DESC LIMIT 1',
    [phone, smsCode]
  ) as any[]
  if ((codeRows as any[]).length === 0) {
    ctx.status = 400
    ctx.body = { code: 400, message: '验证码无效或已过期' }
    return
  }

  await pool.query('UPDATE sms_codes SET used = 1 WHERE id = ?', [(codeRows as any[])[0].id])

  const token = (ctx.headers.authorization || '').replace('Bearer ', '')
  const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: number }
  await pool.query('UPDATE users SET phone = ? WHERE id = ?', [phone, payload.userId])

  ctx.body = { code: 0, message: '绑定成功' }
})

// Web 端手机号登录
router.post('/phone-login', async (ctx) => {
  const { phone, smsCode } = ctx.request.body as { phone: string; smsCode: string }
  if (!phone || !smsCode) {
    ctx.status = 400
    ctx.body = { code: 400, message: '参数不完整' }
    return
  }

  const [codeRows] = await pool.query(
    'SELECT id FROM sms_codes WHERE phone = ? AND code = ? AND used = 0 AND expired_at > NOW() ORDER BY id DESC LIMIT 1',
    [phone, smsCode]
  ) as any[]
  if ((codeRows as any[]).length === 0) {
    ctx.status = 400
    ctx.body = { code: 400, message: '验证码无效或已过期' }
    return
  }

  await pool.query('UPDATE sms_codes SET used = 1 WHERE id = ?', [(codeRows as any[])[0].id])

  const [userRows] = await pool.query('SELECT id, nickname FROM users WHERE phone = ?', [phone]) as any[]
  if ((userRows as any[]).length === 0) {
    ctx.status = 400
    ctx.body = { code: 400, message: '该手机号未绑定账号，请先在小程序中绑定' }
    return
  }

  const user = (userRows as any[])[0]
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '30d' })
  ctx.body = { code: 0, data: { token, user } }
})

// 发送短信验证码
router.post('/send-sms', async (ctx) => {
  const { phone } = ctx.request.body as { phone: string }
  if (!phone || !/^1\d{10}$/.test(phone)) {
    ctx.status = 400
    ctx.body = { code: 400, message: '手机号格式不正确' }
    return
  }

  // 1分钟内不能重复发送
  const [recent] = await pool.query(
    'SELECT id FROM sms_codes WHERE phone = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE) LIMIT 1',
    [phone]
  ) as any[]
  if ((recent as any[]).length > 0) {
    ctx.status = 429
    ctx.body = { code: 429, message: '发送过于频繁，请稍后再试' }
    return
  }

  const code = String(Math.floor(100000 + Math.random() * 900000))
  const expiredAt = new Date(Date.now() + 5 * 60 * 1000)

  await pool.query('INSERT INTO sms_codes (phone, code, expired_at) VALUES (?, ?, ?)', [phone, code, expiredAt])

  // TODO: 调用阿里云短信 SDK 发送
  // 开发阶段直接返回 code 方便调试
  ctx.body = { code: 0, message: '发送成功', _dev_code: process.env.NODE_ENV !== 'production' ? code : undefined }
})

export default router
