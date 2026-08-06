const audit=require('../services/auditService');
module.exports=function(req,res,next){res.on('finish',()=>{if(req.session?.user&&req.path!=='/audit/click')audit.record(req,{eventType:req.method==='GET'?'PAGE_VIEW':'ACTION',action:`${req.method} ${req.path}`,description:`Response status ${res.statusCode}`,metadata:req.method==='GET'?req.query:req.body}).catch(console.error);});next();};
