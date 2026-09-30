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

// Render can provide a placeholder DB host in the existing DATABASE_URL.
// Normalize that host to the actual Arcanum Postgres internal hostname so the
// application does not crash during startup.
function normalizeDatabaseUrl(raw) {
  if (!raw) return null;
  const fallbackHost = process.env.ARCANUM_DB_HOST || 'dpg-dats7uad0e5s73dbbgdg-a';
  try {
    const url = new URL(raw);
    if (url.hostname === 'base' || url.hostname === 'localhost') url.hostname = fallbackHost;
    return url.toString();
  } catch {
    return raw.replace(/@base(?=[:/]|$)/, `@${fallbackHost}`);
  }
}

const DATABASE_URL = normalizeDatabaseUrl(process.env.DATABASE_URL);
const pool = new Pool({ connectionString: DATABASE_URL, ssl: DATABASE_URL ? { rejectUnauthorized: false } : false });
const uploadDir = process.env.UPLOAD_DIR || './uploads';
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 25 * 1024 * 1024 } });
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(process.cwd(), 'public')));
const id = () => crypto.randomUUID();
async function q(text, params=[]) { return pool.query(text, params); }
async function init() { if (!DATABASE_URL) return; await q(fs.readFileSync('./schema.sql','utf8')); await bootstrapAdmin(); }
async function bootstrapAdmin() {
  const username = process.env.ARCANUM_ADMIN_USERNAME;
  const password = process.env.ARCANUM_ADMIN_PASSWORD;
  const email = process.env.ARCANUM_ADMIN_EMAIL || `${String(username || 'admin').toLowerCase()}@arcanum.local`;
  if (!username || !password) return;
  const existing = await q('SELECT id FROM users WHERE email=$1 OR display_name=$2 LIMIT 1',[email.toLowerCase(),username]);
  if (existing.rowCount) return;
  const hash = await bcrypt.hash(password, 12);
  await q('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)',[id(),email.toLowerCase(),username,hash]);
  console.log('Arcanum administrator initialized.');
}
function auth(req,res,next){ try { const h=req.headers.authorization||''; const token=h.startsWith('Bearer ')?h.slice(7):null; if(!token) return res.status(401).json({error:'Login required'}); req.user=jwt.verify(token,JWT_SECRET); next(); } catch { res.status(401).json({error:'Invalid session'}); } }
app.get('/api/health', async (_req,res)=>{ try { await q('SELECT 1'); res.json({ok:true,service:'Arcanum Core',time:new Date().toISOString()}); } catch { res.status(503).json({ok:false}); }});
app.post('/api/auth/register', async (req,res)=>{ try { const {email,password,displayName}=req.body; if(!email||!password||!displayName) return res.status(400).json({error:'email, password and displayName are required'}); const hash=await bcrypt.hash(password,12); const uid=id(); await q('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)',[uid,email.toLowerCase(),displayName,hash]); const token=jwt.sign({id:uid,email:email.toLowerCase()},JWT_SECRET,{expiresIn:'30d'}); res.json({token,user:{id:uid,email:email.toLowerCase(),displayName}}); } catch(e){ res.status(409).json({error:e.code==='23505'?'Email already registered':'Registration failed'}); }});
app.post('/api/auth/login', async (req,res)=>{ try { const {email,password,deviceName='Unknown device',username}=req.body; const identity=String(email||username||'').toLowerCase(); const r=await q('SELECT * FROM users WHERE email=$1 OR LOWER(display_name)=$1',[identity]); if(!r.rowCount||!(await bcrypt.compare(password,r.rows[0].password_hash))) return res.status(401).json({error:'Invalid credentials'}); const u=r.rows[0]; const token=jwt.sign({id:u.id,email:u.email},JWT_SECRET,{expiresIn:'30d'}); await q('INSERT INTO sessions(id,user_id,device_name,token_hash) VALUES($1,$2,$3,$4)',[id(),u.id,deviceName,crypto.createHash('sha256').update(token).digest('hex')]); res.json({token,user:{id:u.id,email:u.email,displayName:u.display_name}}); } catch { res.status(500).json({error:'Login failed'}); }});
app.get('/api/me',auth,async(req,res)=>{ const r=await q('SELECT id,email,display_name,created_at FROM users WHERE id=$1',[req.user.id]); res.json(r.rows[0]); });
app.get('/api/categories',auth,async(_req,res)=>{ const r=await q('SELECT * FROM categories ORDER BY name'); res.json(r.rows); });
app.post('/api/categories',auth,async(req,res)=>{ const r=await q('INSERT INTO categories(id,name,parent_id) VALUES($1,$2,$3) RETURNING *',[id(),req.body.name,req.body.parentId||null]); res.json(r.rows[0]); });
app.get('/api/knowledge',auth,async(req,res)=>{ const search=req.query.search||''; const r=await q(`SELECT k.*,c.name category_name,u.display_name owner_name FROM knowledge k LEFT JOIN categories c ON c.id=k.category_id LEFT JOIN users u ON u.id=k.owner_id WHERE (k.visibility='public' OR k.owner_id=$1) AND (k.title ILIKE $2 OR k.content ILIKE $2) ORDER BY k.updated_at DESC`,[req.user.id,`%${search}%`]); res.json(r.rows); });
app.post('/api/knowledge',auth,async(req,res)=>{ const {title,content='',source='',language='vi',categoryId=null,visibility='public'}=req.body; const kid=id(); const r=await q('INSERT INTO knowledge(id,owner_id,category_id,title,content,source,language,visibility) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[kid,req.user.id,categoryId,title,content,source,language,visibility]); await q('INSERT INTO knowledge_versions(knowledge_id,editor_id,version,title,content,source) VALUES($1,$2,1,$3,$4,$5)',[kid,req.user.id,title,content,source]); res.json(r.rows[0]); });
app.patch('/api/knowledge/:id',auth,async(req,res)=>{ const old=await q('SELECT * FROM knowledge WHERE id=$1 AND owner_id=$2',[req.params.id,req.user.id]); if(!old.rowCount) return res.status(404).json({error:'Not found'}); const k=old.rows[0],next=k.version+1,title=req.body.title??k.title,content=req.body.content??k.content,source=req.body.source??k.source; const r=await q('UPDATE knowledge SET title=$1,content=$2,source=$3,version=$4,updated_at=now() WHERE id=$5 RETURNING *',[title,content,source,next,k.id]); await q('INSERT INTO knowledge_versions(knowledge_id,editor_id,version,title,content,source) VALUES($1,$2,$3,$4,$5,$6)',[k.id,req.user.id,next,title,content,source]); res.json(r.rows[0]); });
app.get('/api/knowledge/:id/versions',auth,async(req,res)=>{ const r=await q('SELECT * FROM knowledge_versions WHERE knowledge_id=$1 ORDER BY version DESC',[req.params.id]); res.json(r.rows); });
app.post('/api/files',auth,upload.single('file'),async(req,res)=>{ if(!req.file) return res.status(400).json({error:'File required'}); const r=await q('INSERT INTO files(id,owner_id,knowledge_id,filename,mime_type,size_bytes,storage_path) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[id(),req.user.id,req.body.knowledgeId||null,req.file.originalname,req.file.mimetype,req.file.size,req.file.path]); res.json(r.rows[0]); });
app.get('/api/devices',auth,async(req,res)=>{ const r=await q('SELECT id,device_name,created_at,last_seen_at FROM sessions WHERE user_id=$1 ORDER BY last_seen_at DESC',[req.user.id]); res.json(r.rows); });
app.post('/api/translate',auth,async(req,res)=>{ const {text,targetLanguage='vi'}=req.body; if(!text) return res.status(400).json({error:'text required'}); res.json({source:text,targetLanguage,note:'Translation provider is pluggable; connect a translation API through server environment variables.'}); });
app.get(/.*/,(_req,res)=>res.sendFile(path.join(process.cwd(),'public','index.html')));
init().then(()=>app.listen(PORT,()=>console.log(`Arcanum Core listening on ${PORT}`))).catch(err=>{console.error(err);process.exit(1)});