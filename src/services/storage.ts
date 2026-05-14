import * as cloudbaseModule from '@cloudbase/node-sdk'

let app: any

function getApp() {
  if (!app) {
    app = cloudbaseModule.init({
      env: process.env.CLOUDBASE_ENV_ID!,
      secretId: process.env.TENCENT_SECRET_ID,
      secretKey: process.env.TENCENT_SECRET_KEY,
    })
  }
  return app
}

export async function uploadFile(buffer: Buffer, cloudPath: string): Promise<string> {
  const app = getApp()
  await app.uploadFile({
    cloudPath,
    fileContent: buffer,
  })
  return `cloud://${process.env.CLOUDBASE_ENV_ID}.${process.env.CLOUDBASE_ENV_ID?.split('-')[0]}-${process.env.CLOUDBASE_ENV_ID?.split('-').slice(1).join('-')}/${cloudPath}`
}

export async function getFileURL(cloudPath: string): Promise<string> {
  const app = getApp()
  const result = await app.getTempFileURL({
    fileList: [cloudPath],
  }) as any
  return result.fileList[0].tempFileURL
}
