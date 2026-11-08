import { personLinks } from '../identity/store.js';
import { JwtService } from '@nestjs/jwt';
import { tenantContext, tenantSource } from './context.js';
import { registry, resolveTenant, validateIdentity } from './registry.js';

export function tenantMiddleware(jwt: JwtService) {
  return (req: any, res: any, next: any) => tenantContext.run({}, async () => {
    try {
      if(req.path==='/iot'||req.path.startsWith('/iot/')||req.path==='/market'||req.path.startsWith('/market/'))return next();
      if (req.path === '/' || req.path.startsWith('/socket.io') || req.path === '/platform' || req.path.startsWith('/platform/')) return next();
      if (['/auth/organization','/auth/identify','/auth/discovery-code'].includes(req.path)) return next();
      if(['/identity/login','/identity/send-code','/identity/business-login'].includes(req.path))return next();
      let tenant:any;
      const publicAuth = ['/auth/login','/auth/register','/auth/send-code'].includes(req.path);
      if (publicAuth) {
        let selectedId = req.body?.organizationId;
        if(req.body?.selectionToken){
          const selection=jwt.verify(req.body.selectionToken);
          if(req.path!=='/auth/login' || selection.purpose!=='organization_selection' || selection.phone!==req.body.phone || selection.role!==req.body.role || !selection.organizations?.includes(selectedId))throw new Error('Invalid organization selection');
          tenantContext.getStore()!.loginVerified=true;
        }
        if(selectedId){
          if(typeof selectedId!=='string' || !/^[a-f0-9-]{36}$/i.test(selectedId))throw new Error('Invalid organization');
          const selected=(await registry.query('SELECT code FROM platform.tenants WHERE id=$1',[selectedId])).rows[0];
          if(!selected)throw new Error('Unknown organization');
          tenant=await resolveTenant(selected.code);
        }
        const code = tenant?.code || req.body?.tenantCode || 'demo';
        if (typeof code !== 'string' || !/^[a-z0-9-]{2,40}$/.test(code)) return res.status(400).json({message:'请输入正确的企业代码'});
        tenant = await resolveTenant(code);
      } else {
        const token = req.path.startsWith('/uploads/') ? req.query.ticket : req.headers.authorization?.replace(/^Bearer /, '');
        const payload = jwt.verify(token);
        if (req.path.startsWith('/uploads/')) {
          if (payload.purpose !== 'file' || payload.path !== req.path) throw new Error('Invalid file ticket');
          tenant = await validateIdentity({...payload, purpose:'access'});
          if (req.headers.authorization) {
            const viewer = jwt.verify(req.headers.authorization.replace(/^Bearer /,''));
            if(viewer.purpose==='unified_access'){if(!(await personLinks(viewer)).some(l=>l.id===tenant.id))throw new Error('Foreign file');}
            else {await validateIdentity(viewer);if(viewer.tenantId!==tenant.id)throw new Error('Foreign file');}
            if (viewer.purpose!=='unified_access' && viewer.tenantId !== tenant.id) throw new Error('Foreign file');
          }
        } else tenant = await validateIdentity(payload);
        req.user = payload;
      }
      if ((req.headers['x-tenant-code'] && req.headers['x-tenant-code'] !== tenant.code) || (req.headers['x-tenant-id'] && req.headers['x-tenant-id'] !== tenant.id) || (!publicAuth && req.body?.tenantCode && req.body.tenantCode !== tenant.code)) return res.status(403).json({message:'企业身份不匹配'});
      const requiredFeature = /^\/operations\/contracts(?:\/|$)/.test(req.path) ? 'contracts' : /^\/operations\/(finance|receipts|invoices)(?:\/|$)/.test(req.path) ? 'finance' : null;
      if(requiredFeature && !tenant.features.includes(requiredFeature)) return res.status(403).json({message:'当前企业套餐未开通此功能，请联系企业管理员',code:'FEATURE_UNAVAILABLE'});
      const context = tenantContext.getStore()!;
      context.tenant = tenant;
      context.user = req.user;
      context.source = await tenantSource(tenant);
      // Persist canonical paths rather than expiring signed URLs. Foreign paths are rejected.
      function normalize(value: any): any {
        if (typeof value === 'string' && value.startsWith('/uploads/')) {
          const path = value.split('?')[0];
          if (!path.startsWith(`/uploads/${tenant!.id}/`) && !(tenant!.code === 'demo' && path.startsWith('/uploads/fault-photos/'))) throw new Error('Foreign upload path');
          return path;
        }
        if (Array.isArray(value)) return value.map(normalize);
        if (value && typeof value === 'object') for (const key of Object.keys(value)) value[key] = normalize(value[key]);
        return value;
      }
      if (!publicAuth) req.body = normalize(req.body);
      next();
    } catch { res.status(401).json({message:'企业或登录身份无效，请重新登录'}); }
  });
}
