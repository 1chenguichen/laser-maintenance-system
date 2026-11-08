const path=require('node:path');
const {createRequire}=require('node:module');
const app=path.resolve(__dirname,'../apps/cs-admin');process.chdir(app);
process.env.NODE_ENV='development';process.env.BABEL_ENV='development';
process.env.DISABLE_ESLINT_PLUGIN='true';
process.env.REACT_APP_API_BASE=process.env.REACT_APP_API_BASE||'http://localhost:8180';
const req=createRequire(path.join(app,'package.json'));
const webpack=req('webpack');const Server=req('webpack-dev-server');
const config=req('./node_modules/react-scripts/config/webpack.config.js')('development');
// Windows restricted sessions block checker child processes. start-preview.ps1
// runs tsc successfully before launching this server; do not skip that preflight.
config.plugins=config.plugins.filter(p=>!p.constructor.name.includes('ForkTsChecker'));
new Server({host:'127.0.0.1',port:3100,historyApiFallback:true,static:{directory:path.join(app,'public')}},webpack(config)).start();
