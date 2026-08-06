const multer=require('multer'); const path=require('path'); const crypto=require('crypto'); const config=require('../config');
const storage=multer.diskStorage({destination:config.uploadDir,filename:(req,file,cb)=>cb(null,Date.now()+'-'+crypto.randomBytes(6).toString('hex')+path.extname(file.originalname))});
module.exports=multer({storage,limits:{fileSize:5*1024*1024},fileFilter:(req,file,cb)=>{const ok=/\.(pdf|png|jpe?g|docx?|xlsx?|txt)$/i.test(file.originalname); cb(ok?null:new Error('Unsupported file type'),ok);}});
