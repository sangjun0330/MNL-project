// Minimal type shim for "pg" to avoid TS7016 in strict mode.
// The app uses pg only on the server side.
declare module "pg" {
  export class Pool {
    constructor(config?: any);
    query: any;
    connect: any;
    end: any;
  }

  export type PoolClient = any;
}
