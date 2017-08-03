const http = require('http')

const githubWebhookHandler = require('github-webhook-handler')
const handler = githubWebhookHandler({ path: '/webhook', secret: 'myhashsecret' })

let server = http.createServer((req, res) => {
    handler(req, res, err => {
        res.statusCode = 404
        res.end('no such location')
    })
})

handler.on('error', err => {
    console.error('Error:', err.message)
})

handler.on('push', event => {
    console.log('Received a push event for %s to %s', event.payload.repository.name, event.payload.ref)
})

server.listen(3000)