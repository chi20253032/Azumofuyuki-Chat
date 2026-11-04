const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const net=require('node:net');
const os=require('node:os');
const path=require('node:path');
const fs=require('node:fs');
const {once}=require('node:events');

async function freePort(){const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p;}
test('server health, admin approval, channels and direct messages',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'azumo-chat-'));
 const port=await freePort(),base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['server.js'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),NODE_ENV:'test',DATABASE_FILE:path.join(dir,'app.sqlite'),ADMIN_PASSWORD:'TestAdminPassword!123',SESSION_SECRET:'test-session-secret-that-is-long-enough-123456789'} ,stdio:'ignore'});
 t.after(()=>{child.kill('SIGTERM');fs.rmSync(dir,{recursive:true,force:true});});
 let ready=false;
 for(let i=0;i<60;i++){try{const r=await fetch(base+'/api/health');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
 assert.equal(ready,true,'server should start and expose health endpoint');
 const call=async(url,method='GET',body, cookie)=>{const r=await fetch(base+url,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});const data=await r.json().catch(()=>({}));return{r,data,cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 const adminLogin=await call('/api/login','POST',{username:'AzumoAurora3032',password:'TestAdminPassword!123'});
 assert.equal(adminLogin.r.status,200);
 const adminCookie=adminLogin.cookie;assert.ok(adminCookie);
 const application=await call('/api/apply','POST',{username:'TestPlayer1',password:'MemberPassword!123'});
 assert.equal(application.r.status,201);assert.match(application.data.code,/^[A-F0-9]{6}$/);
 const pending=await call('/api/admin/applications','GET',null,adminCookie);
 assert.equal(pending.data.applications.length,1);
 const approved=await call('/api/admin/applications/'+pending.data.applications[0].id+'/approve','POST',{},adminCookie);
 assert.equal(approved.r.status,200);
 const memberLogin=await call('/api/login','POST',{username:'TestPlayer1',password:'MemberPassword!123'});
 assert.equal(memberLogin.r.status,200);
 const channels=await call('/api/channels','GET',null,memberLogin.cookie);
 assert.equal(channels.data.channels.length,3);
 const dm=await call('/api/dms','POST',{username:'TestPlayer1'},adminCookie);
 assert.equal(dm.r.status,201);
 const sent=await call('/api/dms/'+dm.data.id+'/messages','POST',{body:'hello from test'},adminCookie);
 assert.equal(sent.r.status,201);assert.equal(sent.data.message.body,'hello from test');
 const dms=await call('/api/dms','GET',null,memberLogin.cookie);
 assert.equal(dms.data.conversations.length,1);
});
