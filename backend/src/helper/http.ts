import { TResponse } from "../types"

export const JsonOk = (data: any): TResponse => {
  return {
    success: true,
    data,
    message: '',
    details: null
  }
}

export const JsonError = <T>(message: string, details?: T): TResponse<null, T> => {
  return {
    success: false,
    data: null,
    message,
    details
  }
}