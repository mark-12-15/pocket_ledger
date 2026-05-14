import Router from '@koa/router'
import { authMiddleware } from '../middleware/auth'
import pool from '../db'

const router = new Router({ prefix: '/records' })

router.use(authMiddleware)

// 创建账单（手动输入）
router.post('/', async (ctx) => {
  const { type, amount, category, note, happened_at } = ctx.request.body as any
  if (!type || !amount || !happened_at) {
    ctx.status = 400
    ctx.body = { code: 400, message: '类型、金额、日期不能为空' }
    return
  }

  const [result] = await pool.query(
    'INSERT INTO records (user_id, type, amount, category, note, happened_at, input_method, parse_status) VALUES (?, ?, ?, ?, ?, ?, 1, 0)',
    [ctx.state.userId, type, amount, category || null, note || null, happened_at]
  ) as any

  ctx.body = { code: 0, data: { id: result.insertId } }
})

// 查询账单列表（支持 period: month/quarter/year + date 参数）
router.get('/', async (ctx) => {
  const { period = 'month', date } = ctx.query as { period?: string; date?: string }
  const userId = ctx.state.userId

  let dateFilter = ''
  const params: any[] = [userId]

  if (period === 'month') {
    const d = (date || new Date().toISOString()).slice(0, 7)
    dateFilter = "AND DATE_FORMAT(happened_at, '%Y-%m') = ?"
    params.push(d)
  } else if (period === 'quarter') {
    const d = date || new Date().toISOString()
    const year = d.slice(0, 4)
    const month = parseInt(d.slice(5, 7) || '1')
    const q = Math.ceil(month / 3)
    dateFilter = 'AND YEAR(happened_at) = ? AND QUARTER(happened_at) = ?'
    params.push(year, q)
  } else if (period === 'year') {
    const year = (date || String(new Date().getFullYear())).slice(0, 4)
    dateFilter = 'AND YEAR(happened_at) = ?'
    params.push(year)
  }

  const [rows] = await pool.query(
    `SELECT id, type, amount, category, note, DATE_FORMAT(happened_at, '%Y-%m-%d') as happened_at, input_method, parse_status, created_at
     FROM records WHERE user_id = ? AND parse_status IN (0, 4) ${dateFilter} ORDER BY happened_at DESC, id DESC`,
    params
  )

  ctx.body = { code: 0, data: rows }
})

// 查询汇总（收入/支出合计）
router.get('/summary', async (ctx) => {
  const { period = 'month', date } = ctx.query as { period?: string; date?: string }
  const userId = ctx.state.userId

  let dateFilter = ''
  const params: any[] = [userId]

  if (period === 'month') {
    const d = (date || new Date().toISOString()).slice(0, 7)
    dateFilter = "AND DATE_FORMAT(happened_at, '%Y-%m') = ?"
    params.push(d)
  } else if (period === 'quarter') {
    const d = date || new Date().toISOString()
    const year = d.slice(0, 4)
    const month = parseInt(d.slice(5, 7) || '1')
    const q = Math.ceil(month / 3)
    dateFilter = 'AND YEAR(happened_at) = ? AND QUARTER(happened_at) = ?'
    params.push(year, q)
  } else if (period === 'year') {
    const year = (date || String(new Date().getFullYear())).slice(0, 4)
    dateFilter = 'AND YEAR(happened_at) = ?'
    params.push(year)
  }

  const [rows] = await pool.query(
    `SELECT type, SUM(amount) AS total FROM records WHERE user_id = ? AND parse_status IN (0, 4) ${dateFilter} GROUP BY type`,
    params
  ) as any[]

  const summary = { income: 0, expense: 0 }
  for (const row of rows as any[]) {
    if (row.type === 1) summary.income = Number(row.total)
    if (row.type === 2) summary.expense = Number(row.total)
  }

  ctx.body = { code: 0, data: summary }
})

// 获取单条账单
router.get('/:id', async (ctx) => {
  const { id } = ctx.params
  const [rows] = await pool.query(
    `SELECT id, type, amount, category, note, DATE_FORMAT(happened_at, '%Y-%m-%d') as happened_at, input_method, parse_status, raw_file_url, created_at FROM records WHERE id = ? AND user_id = ?`,
    [id, ctx.state.userId]
  ) as any[]
  if ((rows as any[]).length === 0) {
    ctx.status = 404
    ctx.body = { code: 404, message: '账单不存在' }
    return
  }
  ctx.body = { code: 0, data: (rows as any[])[0] }
})

// 更新账单
router.put('/:id', async (ctx) => {
  const { id } = ctx.params
  const { type, amount, category, note, happened_at } = ctx.request.body as any

  const [rows] = await pool.query('SELECT id FROM records WHERE id = ? AND user_id = ?', [id, ctx.state.userId]) as any[]
  if ((rows as any[]).length === 0) {
    ctx.status = 404
    ctx.body = { code: 404, message: '账单不存在' }
    return
  }

  const { parse_status } = ctx.request.body as any

  // 日期合理性校验：AI 解析的日期超过 90 天前则改用今天
  const today = new Date()
  const happenedDate = new Date(happened_at)
  const diffDays = (today.getTime() - happenedDate.getTime()) / (1000 * 86400)
  const safeDate = (isNaN(diffDays) || diffDays > 90 || diffDays < -1)
    ? today.toISOString().slice(0, 10)
    : happened_at

  const updateFields: any[] = [type, amount, category || null, note || null, safeDate]
  let sql = 'UPDATE records SET type = ?, amount = ?, category = ?, note = ?, happened_at = ?'
  if (parse_status !== undefined) {
    sql += ', parse_status = ?'
    updateFields.push(parse_status)
  }
  sql += ' WHERE id = ?'
  updateFields.push(id)

  await pool.query(sql, updateFields)

  ctx.body = { code: 0, message: '更新成功' }
})

// 删除账单
router.delete('/:id', async (ctx) => {
  const { id } = ctx.params
  const [rows] = await pool.query('SELECT id FROM records WHERE id = ? AND user_id = ?', [id, ctx.state.userId]) as any[]
  if ((rows as any[]).length === 0) {
    ctx.status = 404
    ctx.body = { code: 404, message: '账单不存在' }
    return
  }

  await pool.query('DELETE FROM records WHERE id = ?', [id])
  ctx.body = { code: 0, message: '删除成功' }
})

export default router
