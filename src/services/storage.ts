import * as cloudbaseModule from '@cloudbase/node-sdk'

const cloudbase = (cloudbaseModule as any).default || cloudbaseModule

let app: any

function getApp() {
  if (!app) {
    app = cloudbase({
      env: process.env.CLOUDBASE_ENV_ID!,
      secretId: process.env.TENCENT_SECRET_ID,
      secretKey: process.env.TENCENT_SECRET_KEY,
    })
  }
  return app
}

export async function uploadFile(buffer: Buffer, cloudPath: string): Promise<string> {
  const storage = getApp().storage()
  await storage.uploadFile({
    cloudPath,
    fileContent: buffer,
  })
  const result = await storage.getTempFileURL({ fileList: [cloudPath] })
  // 返回永久访问地址格式
  return `cloud://${process.env.CLOUDBASE_ENV_ID}.${process.env.CLOUDBASE_ENV_ID?.split('-')[0]}-${process.env.CLOUDBASE_ENV_ID?.split('-').slice(1).join('-')}/${cloudPath}`
}

export async function getFileURL(cloudPath: string): Promise<string> {
  const storage = getApp().storage()
  const result = await storage.getTempFileURL({
    fileList: [cloudPath],
  }) as any
  return result.fileList[0].tempFileURL
}
