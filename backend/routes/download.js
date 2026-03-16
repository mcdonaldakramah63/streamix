const express = require('express')
const { getDownloadLinks, proxyTorrentFile } = require('../controllers/downloadController')
const r = express.Router()

r.get('/',     getDownloadLinks)    // /api/download?imdbId=...&title=...&type=movie
r.get('/file', proxyTorrentFile)    // /api/download/file?url=...&filename=...

module.exports = r
