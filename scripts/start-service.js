import { spawn } from 'node:child_process';
import { bootstrapKeeper } from '../src/keeper-bootstrap.js';
const serviceEnv=await bootstrapKeeper(process.env);
if(serviceEnv.INIT_KEEPER_ON_START==='true') console.log(`ChainPilot execution keeper: ${serviceEnv.KEEPER_ADDRESS}. No funding or transactions performed.`);
const children=[];
let stopping=false;
function stop(){if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');}
for(const script of ['src/server.js',...(process.env.RUN_WORKER==='true'?['scripts/worker.js']:[])]) {
  const child=spawn(process.execPath,[script],{stdio:'inherit',env:serviceEnv});children.push(child);
  child.on('exit',code=>{if(!stopping){stop();process.exitCode=code||1;}});
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,stop);
