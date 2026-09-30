import express from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;
const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

function normalizeDatabaseUrl(raw) {
  if (!raw) return null;
  const fallbackHost = process.env.ARCANUM_DB_HOST || 'dpg-dats7uad0e5s73dbbgdg-a.oregon-postgres.render.com';
  try {
    const url = new URL(raw);
    if (url.hostname === 'base' || url.hostname === 'localhost') {
      url.hostname = fallbackHost;
      if (fallbackHost.endsWith('.render.com')) url.searchParams.set('sslmode','require');
    }
    return url.toString();
  } catch {
    const replaced = raw.replace(/@base(?=[:/]|$)/, `@${fallbackHost}`);
    return fallbackHost.endsWith('.render.com') && !/sslmode=/i.test(replaced)
      ? `${replaced}${replaced.includes('?')?'&':'?'}sslmode=require`
      : replaced;
  }
}

const DATABASE_URL = normalizeDatabaseUrl(process.env.DATABASE_URL);
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 8000
});

const uploadDir = process.env.UPLOAD_DIR || './uploads';
fs.mkdirSync(uploadDir,{recursive:true});
const upload = multer({dest:uploadDir, limits:{fileSize:25*1024*1024}});
app.use(express.json({limit:'10mb'}));
app.use(express.static(path.join(process.cwd(),'public')));

const id=()=>crypto.randomUUID();
async function q(sql,params=[]){return pool.query(sql,params);}

async function init(){
  if(!DATABASE_URL) return;
  await q(fs.readFileSync('./schema.sql','utf8'));
  await bootstrapAdmin();
}

async function bootstrapAdmin(){
  const username=process.env.ARCANUM_ADMIN_USERNAME;
  const password=process.env.ARCANUM_ADMIN_PASSWORD;
  if(!username||!password) return;
  const email=(process.env.ARCANUM_ADMIN_EMAIL||`${String(username).toLowerCase()}@arcanum.local`).toLowerCase();
  const existing=await q('SELECT id FROM users WHERE email=$1 OR LOWER(display_name)=LOWER($2) LIMIT 1',[email,username]);
  const hash=await bcrypt.hash(password,12);
  if(existing.rowCount){
    await q('UPDATE users SET email=$1,password_hash=$2,display_name=$3,role=\'Admin\',status=\'active\' WHERE id=$4',[email,hash,username,existing.rows[0].id]);
  }else{
    await q('INSERT INTO users(id,email,display_name,password_hash,role,status) VALUES($1,$2,$3,$4,\'Admin\',\'active\')',[id(),email,username,hash]);
  }
  console.log('Arcanum administrator initialized.');
}

function auth(req,res,next){
  try{
    const h=req.headers.authorization||'';
    const token=h.startsWith('Bearer ')?h.slice(7):null;
    if(!token) return res.status(401).json({error:'Login required'});
    req.user=jwt.verify(token,JWT_SECRET);
    next();
  }catch{return res.status(401).json({error:'Invalid session'});}
}

async function audit(actorId,action,type='',resourceId='',metadata={}){
  try{await q('INSERT INTO audit_log(actor_id,action,resource_type,resource_id,metadata) VALUES($1,$2,$3,$4,$5)',[actorId,action,type,resourceId,metadata]);}catch{}
}

app.get('/api/health',async(_req,res)=>{
  try{await q('SELECT 1');res.json({ok:true,service:'Arcanum Core',time:new Date().toISOString()});}
  catch{res.status(503).json({ok:false,error:'Database unavailable'});}
});

app.post('/api/auth/register',async(req,res)=>{
  try{
    const {email,password,displayName}=req.body;
    if(!email||!password||!displayName) return res.status(400).json({error:'email, password and displayName are required'});
    const hash=await bcrypt.hash(password,12),uid=id(),em=email.toLowerCase();
    await q('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)',[uid,em,displayName,hash]);
    const token=jwt.sign({id:uid,email:em},JWT_SECRET,{expiresIn:'30d'});
    await audit(uid,'REGISTER','user',uid);
    res.json({token,user:{id:uid,email:em,displayName,role:'Member'}});
  }catch(e){res.status(409).json({error:e.code==='23505'?'Email already registered':'Registration failed'});}
});

app.post('/api/auth/login',async(req,res)=>{
  try{
    const {email,password,deviceName='Unknown device',username}=req.body;
    const identity=String(username||email||'').toLowerCase();
    if(!identity||!password) return res.status(400).json({error:'Username and password are required'});
    const r=await q('SELECT * FROM users WHERE LOWER(email)=$1 OR LOWER(display_name)=$1 LIMIT 1',[identity]);
    if(!r.rowCount||!(await bcrypt.compare(password,r.rows[0].password_hash))) return res.status(401).json({error:'Invalid credentials'});
    const u=r.rows[0];
    const token=jwt.sign({id:u.id,email:u.email,role:u.role},JWT_SECRET,{expiresIn:'30d'});
    await q('INSERT INTO sessions(id,user_id,device_name,token_hash) VALUES($1,$2,$3,$4)',[id(),u.id,deviceName,crypto.createHash('sha256').update(token).digest('hex')]);
    await q('UPDATE sessions SET last_seen_at=now() WHERE user_id=$1',[u.id]);
    await audit(u.id,'LOGIN','session',u.id,{deviceName});
    res.json({token,user:{id:u.id,email:u.email,displayName:u.display_name,role:u.role}});
  }catch(e){console.error(e);res.status(500).json({error:'Login failed'});}
});

app.post('/api/auth/logout',auth,async(req,res)=>{
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/,'');
  await q('DELETE FROM sessions WHERE user_id=$1 AND token_hash=$2',[req.user.id,crypto.createHash('sha256').update(token).digest('hex')]);
  await audit(req.user.id,'LOGOUT','session',req.user.id);
  res.json({ok:true});
});

app.get('/api/me',auth,async(req,res)=>{
  const r=await q('SELECT id,email,display_name,role,status,created_at FROM users WHERE id=$1',[req.user.id]);
  if(!r.rowCount)return res.status(404).json({error:'User not found'});
  res.json(r.rows[0]);
});

app.get('/api/categories',auth,async(_req,res)=>{const r=await q('SELECT * FROM categories ORDER BY name');res.json(r.rows);});
app.post('/api/categories',auth,async(req,res)=>{const r=await q('INSERT INTO categories(id,name,parent_id) VALUES($1,$2,$3) RETURNING *',[id(),req.body.name,req.body.parentId||null]);await audit(req.user.id,'CREATE','category',r.rows[0].id);res.json(r.rows[0]);});

app.get('/api/knowledge',auth,async(req,res)=>{
  const search=String(req.query.search||'');
  const r=await q(`SELECT k.*,c.name category_name,u.display_name owner_name
    FROM knowledge k
    LEFT JOIN categories c ON c.id=k.category_id
    LEFT JOIN users u ON u.id=k.owner_id
    WHERE (k.visibility='public' OR k.owner_id=$1)
      AND (k.title ILIKE $2 OR k.content ILIKE $2)
    ORDER BY k.updated_at DESC`,[req.user.id,`%${search}%`]);
  res.json(r.rows);
});

app.post('/api/knowledge',auth,async(req,res)=>{
  try{
    const {title,content='',source='',language='vi',categoryId=null,visibility='public'}=req.body;
    if(!title)return res.status(400).json({error:'title required'});
    const kid=id();
    const r=await q('INSERT INTO knowledge(id,owner_id,category_id,title,content,source,language,visibility) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[kid,req.user.id,categoryId,title,content,source,language,visibility]);
    await q('INSERT INTO knowledge_versions(knowledge_id,editor_id,version,title,content,source) VALUES($1,$2,1,$3,$4,$5)',[kid,req.user.id,title,content,source]);
    await audit(req.user.id,'CREATE','knowledge',kid);
    res.json(r.rows[0]);
  }catch(e){console.error(e);res.status(500).json({error:'Could not save knowledge'});}
});

app.patch('/api/knowledge/:id',auth,async(req,res)=>{
  try{
    const old=await q('SELECT * FROM knowledge WHERE id=$1 AND owner_id=$2',[req.params.id,req.user.id]);
    if(!old.rowCount)return res.status(404).json({error:'Not found'});
    const k=old.rows[0],next=k.version+1;
    const title=req.body.title??k.title,content=req.body.content??k.content,source=req.body.source??k.source;
    const r=await q('UPDATE knowledge SET title=$1,content=$2,source=$3,version=$4,updated_at=now() WHERE id=$5 RETURNING *',[title,content,source,next,k.id]);
    await q('INSERT INTO knowledge_versions(knowledge_id,editor_id,version,title,content,source) VALUES($1,$2,$3,$4,$5,$6)',[k.id,req.user.id,next,title,content,source]);
    await audit(req.user.id,'UPDATE','knowledge',k.id,{version:next});
    res.json(r.rows[0]);
  }catch{res.status(500).json({error:'Could not update knowledge'});}
});

app.get('/api/knowledge/:id/versions',auth,async(req,res)=>{const r=await q('SELECT * FROM knowledge_versions WHERE knowledge_id=$1 ORDER BY version DESC',[req.params.id]);res.json(r.rows);});

app.post('/api/files',auth,upload.single('file'),async(req,res)=>{
  if(!req.file)return res.status(400).json({error:'File required'});
  const r=await q('INSERT INTO files(id,owner_id,knowledge_id,filename,mime_type,size_bytes,storage_path) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[id(),req.user.id,req.body.knowledgeId||null,req.file.originalname,req.file.mimetype,req.file.size,req.file.path]);
  await audit(req.user.id,'UPLOAD','file',r.rows[0].id,{filename:req.file.originalname});
  res.json(r.rows[0]);
});

app.get('/api/devices',auth,async(req,res)=>{const r=await q('SELECT id,device_name,created_at,last_seen_at FROM sessions WHERE user_id=$1 ORDER BY last_seen_at DESC',[req.user.id]);res.json(r.rows);});

app.get('/api/history',auth,async(req,res)=>{
  const isAdmin=req.user.role==='Admin';
  const sql=isAdmin
    ? 'SELECT a.*,u.display_name actor_name FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 500'
    : 'SELECT a.*,u.display_name actor_name FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id WHERE a.actor_id=$1 OR a.resource_id IN (SELECT id::text FROM knowledge WHERE owner_id=$1) ORDER BY a.created_at DESC LIMIT 500';
  const r=await q(sql,isAdmin?[]:[req.user.id]);res.json(r.rows);
});

app.post('/api/books',auth,async(req,res)=>{
  const {title,sourceLanguage='unknown',targetLanguage='vi'}=req.body;
  if(!title)return res.status(400).json({error:'title required'});
  const r=await q('INSERT INTO books(id,owner_id,title,source_language,target_language) VALUES($1,$2,$3,$4,$5) RETURNING *',[id(),req.user.id,title,sourceLanguage,targetLanguage]);
  await audit(req.user.id,'CREATE','book',r.rows[0].id);
  res.json(r.rows[0]);
});

app.get('/api/books',auth,async(req,res)=>{
  const r=await q('SELECT b.*,u.display_name owner_name FROM books b LEFT JOIN users u ON u.id=b.owner_id WHERE b.owner_id=$1 OR $2=true ORDER BY b.updated_at DESC',[req.user.id,req.user.role==='Admin']);
  res.json(r.rows);
});

app.post('/api/books/:id/translations',auth,async(req,res)=>{
  const {chapter='',originalText='',translatedText=''}=req.body;
  const b=await q('SELECT * FROM books WHERE id=$1 AND (owner_id=$2 OR $3=true)',[req.params.id,req.user.id,req.user.role==='Admin']);
  if(!b.rowCount)return res.status(404).json({error:'Book not found'});
  const v=await q('SELECT COALESCE(MAX(version),0)+1 AS next FROM book_translations WHERE book_id=$1 AND chapter=$2',[req.params.id,chapter]);
  const r=await q('INSERT INTO book_translations(book_id,chapter,version,original_text,translated_text,author_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[req.params.id,chapter,v.rows[0].next,originalText,translatedText,req.user.id]);
  await q('UPDATE books SET updated_at=now() WHERE id=$1',[req.params.id]);
  await audit(req.user.id,'CREATE','translation',String(r.rows[0].id),{bookId:req.params.id,chapter});
  res.json(r.rows[0]);
});

app.get('/api/books/:id/translations',auth,async(req,res)=>{
  const r=await q('SELECT bt.*,u.display_name author_name FROM book_translations bt LEFT JOIN users u ON u.id=bt.author_id WHERE bt.book_id=$1 ORDER BY bt.created_at DESC',[req.params.id]);
  res.json(r.rows);
});

app.post('/api/translate',auth,async(req,res)=>{
  const {text,targetLanguage='vi'}=req.body;
  if(!text)return res.status(400).json({error:'text required'});
  res.json({source:text,targetLanguage,note:'Translation provider must be configured separately; this endpoint stores translation workflow data.'});
});

app.get(/.*/,(_req,res)=>res.sendFile(path.join(process.cwd(),'public','index.html')));

init().then(()=>app.listen(PORT,()=>console.log(`Arcanum Core listening on ${PORT}`)))
  .catch(err=>{console.error(err);process.exit(1)});