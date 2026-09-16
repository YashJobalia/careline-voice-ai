// Send only required app variables through stdin; never print their values.
const {loadEnvFile}=require('node:process');const {spawnSync}=require('node:child_process');
loadEnvFile('.env.local');
const keys=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','SESSION_SECRET','DEMO_ACCESS_CODE','OPENAI_MODEL','OPENAI_API_KEY'];
for(const key of keys){if(!process.env[key])continue;const args=['node_modules/vercel/dist/index.js','env','add',key,'production,preview','--yes','--force',key.startsWith('NEXT_PUBLIC_')||key==='OPENAI_MODEL'?'--no-sensitive':'--sensitive'];const result=spawnSync(process.execPath,args,{input:process.env[key],encoding:'utf8',timeout:120000,windowsHide:true,env:{...process.env,CI:'1',NO_UPDATE_NOTIFIER:'1'}});console.log(`${key}: ${result.status===0?'configured':'failed'}`);if(result.status!==0){console.error((result.stderr||'').replaceAll(process.env[key],'[REDACTED]').slice(-1500));process.exit(1);}}
