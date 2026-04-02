import 'mysql2/promise'

declare module 'mysql2/promise' {
  export interface RowDataPacket {
    [column: string]: any
  }

  export function createPool(config: any): Pool

  interface Pool {
    query<T = any>(sql: string, values?: any): Promise<[T, any]>
    execute<T = any>(sql: string, values?: any): Promise<[T, any]>
  }

  interface PoolConnection {
    query<T = any>(sql: string, values?: any): Promise<[T, any]>
    execute<T = any>(sql: string, values?: any): Promise<[T, any]>
  }
}
