import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { planRepayment } from './modules/position-guard.js';
import { configFromEnv, address } from './config.js';
import { createClient, readPosition, jsonSafe } from './chain/venus.js';
import { Store } from './store.js';
import { agentCard, registrationFile } from './metadata.js';
import { enroll, enrollmentMessage, inspectVault } from './agent.js';
import { prepareTransaction } from './transactions.js';
import { campaignStatus, recordRepayment } from './campaign.js';

export function createApp({ config = configFromEnv(), client = createClient(config), store = new Store(config.dataDir) } = {}) {
  const limits = new Map();
  const tools = [
    { name:'analyze_position',description:'Read a live Venus isolated-pool borrower on BSC testnet',inputSchema:{type:'object',properties:{borrower:{type:'string'}},required:['borrower']} },
    { name:'inspect_vault',description:'Check a factory-created repayment vault and proposed action',inputSchema:{type:'object',properties:{vault:{type:'string'},targetBps:{type:'integer'}},required:['vault']} },
    { name:'campaign_status',description:'Report campaign evidence and remaining requirements',inputSchema:{type:'object',properties:{}} }
  ];
  async function callTool(name,args={}) {
    if (name==='analyze_position') return readPosition(client,config,address(args.borrower));
    if (name==='inspect_vault') return inspectVault(client,config,address(args.vault),args.targetBps||15000);
    if (name==='campaign_status') return campaignStatus(client,config,store);
    throw new Error('Unknown tool');
  }
  return createServer({ requestTimeout:20000,headersTimeout:10000 },async (req,res)=>{
    res.setHeader('Content-Type','application/json');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'");
    const send=(status,body)=>{res.writeHead(status);res.end(JSON.stringify(jsonSafe(body)));};
    const path = new URL(req.url,'http://localhost').pathname;
    const ip=req.socket.remoteAddress||'unknown';
    const minute=Math.floor(Date.now()/60000), bucket=limits.get(ip);
    const count=bucket?.minute===minute?bucket.count+1:1;
    limits.set(ip,{minute,count});
    if(limits.size>10000) limits.clear();
    if(count>120) return send(429,{error:'Rate limit exceeded'});
    try {
      if(req.method==='GET') {
        if(path==='/health') {
          const heartbeat=(await store.read()).worker;
          const online=!!heartbeat && Date.now()-heartbeat.at<90000;
          return send(200,{name:'ChainPilot',status:'running',execution:online&&heartbeat.executionEnabled?'enabled':'disabled',workerOnline:online,chainId:config.chainId,modules:['position-guard'],factoryConfigured:!!config.factory});
        }
        if(path==='/.well-known/agent-card.json'||path==='/.well-known/agent.json') return send(200,agentCard(config));
        if(path==='/registration.json') return send(200,registrationFile(config));
        if(path==='/v1/config') return send(200,{...config,rpcUrl:undefined,dataDir:undefined,executionEnabled:undefined});
        if(path==='/v1/campaign') return send(200,await campaignStatus(client,config,store));
        const files={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css'],'/logo.svg':['logo.svg','image/svg+xml']};
        if(files[path]) {
          const [file,type]=files[path];res.setHeader('Content-Type',type);
          return res.end(await readFile(new URL(`../public/${file}`,import.meta.url)));
        }
        return send(404,{error:'Not found'});
      }
      if(req.method!=='POST') return send(405,{error:'Use GET or POST'});
      if(req.headers.origin && req.headers.origin!==config.publicUrl) return send(403,{error:'Origin not allowed'});
      if(!req.headers['content-type']?.startsWith('application/json')) return send(415,{error:'Use application/json'});
      let size=0; const chunks=[];
      for await (const chunk of req) {size+=chunk.length;if(size>16384){send(413,{error:'Request too large'});req.resume();return;}chunks.push(chunk);}
      let body;
      try {body=JSON.parse(Buffer.concat(chunks).toString());} catch {return send(400,{error:'Invalid JSON'});}
      if(!body||Array.isArray(body)||typeof body!=='object') return send(400,{error:'JSON object required'});
      if(path==='/v1/position-guard/plan') return send(200,planRepayment(body.snapshot,body.policy));
      if(path==='/v1/position') return send(200,await readPosition(client,config,address(body.borrower)));
      if(path==='/v1/vault') return send(200,await inspectVault(client,config,address(body.vault),body.targetBps||15000));
      if(path==='/v1/transactions/prepare') return send(200,await prepareTransaction(config,body,client));
      if(path==='/v1/enrollment-message') {
        if(!/^\d{1,30}$/.test(String(body.subscriptionId))||!Number.isSafeInteger(body.targetBps)||body.targetBps<=10000||body.targetBps>50000) return send(400,{error:'Subscription ID and targetBps required'});
        const input={...body,expiresAt:Math.floor(Date.now()/1000)+300};
        return send(200,{...input,message:`${enrollmentMessage(config,input)}\nTarget health factor (bps): ${input.targetBps}`});
      }
      if(path==='/v1/enroll') return send(200,await enroll(client,config,store,body));
      if(path==='/v1/evidence/repayment') return send(200,await recordRepayment(client,config,store,body.hash));
      if(path==='/mcp') {
        const id=body.id??null;
        try {
          if(body.method==='notifications/initialized') {res.writeHead(202);return res.end();}
          let result;
          if(body.method==='initialize') result={protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'ChainPilot',version:'0.2.0'}};
          else if(body.method==='tools/list') result={tools};
          else if(body.method==='ping') result={};
          else if(body.method==='tools/call') result={content:[{type:'text',text:JSON.stringify(jsonSafe(await callTool(body.params?.name,body.params?.arguments)))}]};
          else return send(200,{jsonrpc:'2.0',id,error:{code:-32601,message:'Method not found'}});
          return send(200,{jsonrpc:'2.0',id,result});
        } catch {return send(200,{jsonrpc:'2.0',id,result:{isError:true,content:[{type:'text',text:'Tool failed. Check arguments, deployment configuration and RPC availability.'}]}});}
      }
      if(path==='/a2a') {
        if(body.method!=='message/send') return send(200,{jsonrpc:'2.0',id:body.id??null,error:{code:-32601,message:'Use message/send'}});
        const parts=body.params?.message?.parts||[];
        const data=parts.find(p=>p.kind==='data')?.data;
        const text=parts.filter(p=>p.kind==='text').map(p=>p.text).join(' ');
        const borrower=data?.borrower||text.match(/0x[\da-fA-F]{40}/)?.[0];
        const result=await callTool('analyze_position',{borrower});
        return send(200,{jsonrpc:'2.0',id:body.id??null,result:{kind:'message',messageId:crypto.randomUUID(),role:'agent',parts:[{kind:'data',data:jsonSafe(result)}]}});
      }
      return send(404,{error:'Not found'});
    } catch(error) {
      const safe=error?.shortMessage?'Onchain request failed. Verify inputs, network and deployment.':String(error?.message||'Invalid request');
      return send(400,{error:safe.slice(0,300)});
    }
  });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const config=configFromEnv(),port=Number(process.env.PORT||3001);
  createApp({config}).listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`ChainPilot listening on port ${port}; BSC testnet; web service never signs transactions`));
}
