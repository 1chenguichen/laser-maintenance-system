declare module 'pg' {
  export interface QueryResult { rows: any[]; rowCount: number | null }
  export interface PoolClient { query(sql:string,parameters?:unknown[]):Promise<QueryResult>; release():void }
  export class Pool {
    constructor(options: { host:string; port:number; user:string; password:string; database:string; max:number });
    query(sql:string,parameters?:unknown[]):Promise<QueryResult>;
    connect():Promise<PoolClient>;
    end():Promise<void>;
  }
  export class Client {
    constructor(options: { host:string; port:number; user:string; password:string; database:string; connectionTimeoutMillis?:number; statement_timeout?:number });
    connect():Promise<void>;
    query(sql:string,parameters?:unknown[]):Promise<QueryResult>;
    end():Promise<void>;
  }
}
