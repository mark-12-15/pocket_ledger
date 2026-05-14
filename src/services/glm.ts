import axios from 'axios'

interface ParsedRecord {
  type: number        // 1=收入 2=支出
  amount: number
  category: string
  note: string
  happened_at: string // YYYY-MM-DD
  rawText: string
}

const BASE_CATEGORIES = `支出分类（必须从中选一）：进货采购、员工工资、房租、水电网络、快递物流、餐饮招待、交通出行、广告推广、税费手续费、设备维修、办公耗材、还款、其他支出
收入分类（必须从中选一）：销售收款、服务收款、预收定金、退款收回、借款、其他收入`

const IMAGE_PDF_PROMPT = `你是一个小微企业随手记账助手。用户会提供收据图片、账单截图或PDF内容，请从中提取记账信息并以JSON格式返回。

${BASE_CATEGORIES}

返回格式：
{
  "type": 1或2,        // 1=收入 2=支出
  "amount": 金额数字,  // 正数，单位元
  "category": "从上方对应分类中选择最匹配的一个",
  "note": "简短备注，如商家名称、对方姓名或摘要，无则留空字符串",
  "happened_at": "YYYY-MM-DD"  // 凭证上的日期，无法判断则用今天
}
只返回JSON，不要有其他文字。`

function buildVoicePrompt(today: string): string {
  return `你是一个小微企业随手记账助手。用户用语音说出了一笔收支，请提取记账信息并以JSON格式返回。

今天日期：${today}
日期换算规则：今天=${today}，昨天=前1天，前天=前2天，大前天=前3天，上周X=上周对应日期，以此类推。

${BASE_CATEGORIES}

字段说明：
- amount：金额（元），必须提取，无法识别则为0
- type：用户说的是花钱/支出=2，收到钱/收入=1，无法判断=2
- category：最匹配的分类，无法判断则用"其他支出"或"其他收入"
- note：商家/对方/用途的简短描述，无则空字符串
- happened_at：用上方规则换算成 YYYY-MM-DD，无法判断则用今天

返回格式：
{
  "type": 1或2,
  "amount": 金额数字,
  "category": "分类",
  "note": "备注",
  "happened_at": "YYYY-MM-DD"
}
只返回JSON，不要有其他文字。`
}

export async function parseWithGLM(fileUrlOrText: string, mimeType: string, today?: string): Promise<ParsedRecord | null> {
  const apiKey = process.env.GLM_API_KEY
  if (!apiKey) return null

  try {
    let messages: any[]
    let systemPrompt: string

    if (mimeType.startsWith('image/')) {
      systemPrompt = IMAGE_PDF_PROMPT
      messages = [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: fileUrlOrText } },
          { type: 'text', text: '请解析这张图片中的账单信息' },
        ],
      }]
    } else if (mimeType === 'voice/text') {
      // 语音转写后的文字稿
      systemPrompt = buildVoicePrompt(today || new Date().toISOString().slice(0, 10))
      messages = [{
        role: 'user',
        content: `用户说："${fileUrlOrText}"`,
      }]
    } else {
      // PDF 文本
      systemPrompt = IMAGE_PDF_PROMPT
      messages = [{
        role: 'user',
        content: `请解析以下账单内容：\n${fileUrlOrText}`,
      }]
    }

    const { data } = await axios.post(
      'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      {
        model: mimeType.startsWith('image/') ? 'glm-4v' : 'glm-4',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.1,
      },
      { headers: { Authorization: `Bearer ${apiKey}` } }
    )

    const rawText = data.choices[0].message.content
    console.log('[glm] raw response:', rawText.slice(0, 200))
    // 兼容 GLM 返回 ```json ... ``` 包裹的情况
    const jsonStr = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    const parsed = JSON.parse(jsonStr)
    return { ...parsed, rawText }
  } catch (err: any) {
    console.log('[glm] parse error:', err.message)
    return null
  }
}
