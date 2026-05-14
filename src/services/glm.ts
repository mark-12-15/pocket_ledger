import axios from 'axios'

interface ParsedRecord {
  type: number        // 1=收入 2=支出
  amount: number
  category: string
  note: string
  happened_at: string // YYYY-MM-DD
  rawText: string
}

const SYSTEM_PROMPT = `你是一个账单解析助手。用户会提供图片、PDF内容或语音转写文本，你需要从中提取账单信息并以JSON格式返回。
返回格式：
{
  "type": 1或2,  // 1=收入, 2=支出
  "amount": 金额数字,
  "category": "分类",  // 餐饮/交通/购物/娱乐/医疗/住房/教育/工资/兼职/理财/报销/其他
  "note": "备注",
  "happened_at": "YYYY-MM-DD"  // 账单日期，无法判断则用今天
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
    const parsed = JSON.parse(rawText)
    return { ...parsed, rawText }
  } catch {
    return null
  }
}
