import { AsyncLocalStorage } from 'node:async_hooks';
import { DataSource } from 'typeorm';

export interface Tenant { id: string; code: string; name: string; database_name: string; enabled: boolean; demo_auth: boolean; employee_limit: number; storage_limit_mb: number; features: string[]; expires_at: string | null }
export const tenantContext = new AsyncLocalStorage<{ tenant?: Tenant; source?: DataSource; user?: any; loginVerified?: boolean }>();
export function currentTenant() {
  const tenant = tenantContext.getStore()?.tenant;
  if (!tenant) throw new Error('Tenant context is required');
  return tenant;
}
export function tenantKey(key: string) { return `tenant:${currentTenant().id}:${key}`; }

let base: DataSource;
const sources = new Map<string, Promise<DataSource>>();
export function baseSource() { return base; }
export async function tenantSource(tenant: Tenant) {
  if (tenant.database_name === base.options.database) return base;
  let pending = sources.get(tenant.id);
  if (!pending) {
    // The database name comes exclusively from the operator-managed registry.
    if (!/^laser_[a-z0-9_]+$/.test(tenant.database_name)) throw new Error('Invalid tenant database');
    if (sources.size >= 30) throw new Error('Tenant connection limit reached');
    pending = new DataSource({ ...base.options, database: tenant.database_name, synchronize: false, extra: { max: 3 } } as any).initialize();
    sources.set(tenant.id, pending);
    pending.catch(() => sources.delete(tenant.id));
  }
  return pending;
}
export function routeDataSource(source: DataSource) {
  base = source;
  const active = () => {
    const context = tenantContext.getStore();
    if (context && !context.source) throw new Error('Unresolved tenant: database access denied');
    return context?.source || source;
  };
  const manager = new Proxy(source.manager, { get(_target, key) { const m: any = active().manager; const v = m[key]; return typeof v === 'function' ? v.bind(m) : v; } });
  return new Proxy(source, { get(target, key) {
    if (key === 'getRepository' || key === 'getTreeRepository' || key === 'getMongoRepository') return (entity: any) => new Proxy((target as any)[key](entity), {
      get(_repo, member) { const r = (active() as any)[key](entity); const v = r[member]; return typeof v === 'function' ? v.bind(r) : v; },
    });
    if (key === 'manager') return manager;
    if (key === 'destroy') return async () => { await Promise.all([...sources.values()].map(async s => (await s).destroy())); sources.clear(); return source.destroy(); };
    const selected: any = ['initialize', 'isInitialized', 'options', 'entityMetadatas', 'getMetadata', 'hasMetadata', 'driver', 'name'].includes(String(key)) ? target : active();
    const value = selected[key];
    return typeof value === 'function' ? value.bind(selected) : value;
  }});
}
