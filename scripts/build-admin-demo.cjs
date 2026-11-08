const path=require('node:path'),{createRequire}=require('node:module');
const app=path.resolve(__dirname,'../apps/cs-admin');process.chdir(app);
process.env.NODE_ENV='production';process.env.BABEL_ENV='production';process.env.GENERATE_SOURCEMAP='false';process.env.DISABLE_ESLINT_PLUGIN='true';
const req=createRequire(path.join(app,'package.json')),webpack=req('webpack'),config=req('./node_modules/react-scripts/config/webpack.config.js')('production');
// TypeScript is checked separately; avoid subprocesses unavailable in this Windows session.
config.plugins=config.plugins.filter(p=>!p.constructor.name.includes('ForkTsChecker'));
for(const plugin of config.optimization.minimizer||[])if(plugin.options)plugin.options.parallel=false;
webpack(config,(err,stats)=>{if(err){console.error(err.message);process.exitCode=1;return;}console.log(stats.toString({all:false,errors:true,warnings:true,timings:true}));if(stats.hasErrors())process.exitCode=1;});
