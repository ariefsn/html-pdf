export type TPayload<T = null> = {
  input: T
}

export type TUpload = {
  filename: string
  mimetype: string
  encoding: string
  createReadStream: () => NodeJS.ReadableStream
}

export type TMap = {
  [key: string]: any
}

export type TResponse<TData = null, TDetails = null> = {
  success: boolean
  data: TData
  message: string
  details?: TDetails
}
