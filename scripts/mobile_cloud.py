import os,urllib.parse

def add_cloud_arguments(parser):
 parser.add_argument('--customer-web-url',default=os.environ.get('MOBILE_CUSTOMER_WEB_URL',''))
 parser.add_argument('--engineer-web-url',default=os.environ.get('MOBILE_ENGINEER_WEB_URL',''))

def cloud_origins(args):
 values={'customer':args.customer_web_url,'engineer':args.engineer_web_url}
 if bool(values['customer'])!=bool(values['engineer']):raise SystemExit('Provide both mobile HTTPS origins, or neither for bundled LAN mode')
 result={}
 for role,value in values.items():
  if not value:result[role]='';continue
  try:
   u=urllib.parse.urlsplit(value)
   if u.scheme!='https' or not u.hostname or u.username is not None or u.password is not None or u.path not in ('','/') or u.query or u.fragment or not u.hostname.isascii():raise ValueError()
   port=u.port
   if port is not None and not 1<=port<=65535:raise ValueError()
   result[role]='https://'+u.hostname.lower()+((':'+str(port)) if port and port!=443 else '')
  except ValueError:raise SystemExit('Cloud web URL must be an HTTPS origin without credentials, path, query or fragment')
 return result
