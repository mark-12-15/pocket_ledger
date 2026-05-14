import axios from 'axios'

interface ParsedRecord {
  type: number        // 1=收入 2=支出
  amount: number
  category: string
  note: string
  happened_at: string // YYYY-MM-DD
  rawText: string
}

const SYSTEM_PROMPT = `你是一个小微企业随手记账助手。用户会提供收据图片、账单截图、PDF内容或语音文字，请从中提取记账信息并以JSON格式返回。

支出分类（必须从中选一）：进货采购、员工工资、房租、水电网络、快递物流、餐饮招待、交通出行、广告推广、税费手续费、设备维修、办公耗材、还款、其他支出
收入分类（必须从中选一）：销售收款、服务收款、预收定金、退款收回、借款、其他收入

返回格式：
{
  "type": 1或2,        // 1=收入 2=支出
  "amount": 金额数字,  // 正数，单位元
  "category": "从上方对应分类中选择最匹配的一个",
  "note": "简短备注，如商家名称、对方姓名或摘要，无则留空字符串",
  "happened_at": "YYYY-MM-DD"  // 凭证上的日期，无法判断则用今天
}
只返回JSON，不要有其他文字。`

export async function parseWithGLM(fileUrlOrText: string, mimeType: string): Promise<ParsedRecord | null> {
  const apiKey = process.env.GLM_API_KEY
  if (!apiKey) return null

  try {
    let messages: any[]

    if (mimeType.startsWith('image/')) {
      messages = [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: fileUrlOrText } },
          { type: 'text', text: '请解析这张图片中的账单信息' },
        ],
      }]
    } else {
      // PDF 和音频都转成文本后调用（音频由 GLM 直接处理或前置转写）
      messages = [{
        role: 'user',
        content: `请解析以下账单内容：\n${fileUrlOrText}`,
      }]
    }

    const { data } = await axios.post(
      'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      {
        model: mimeType.startsWith('image/') ? 'glm-4v' : 'glm-4',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
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
