const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });
const aiController = require('../controllers/aiController');

router.post('/message', aiController.handleChatMessage);
router.post('/voice', upload.single('audio'), aiController.handleVoiceMessage);
router.post('/transcribe', upload.single('audio'), aiController.handleAudioTranscription);
router.get('/history', aiController.getChatHistory);
router.delete('/history', aiController.clearChatHistory);

module.exports = router;
