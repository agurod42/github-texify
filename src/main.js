const fs = require('fs')
const http = require('http')
const GitHubApp = require('github-app')
const GitHubWebhook = require('github-webhook-handler')

const GitHubMarkdownLaTexRenderer = require('./githubMarkdownLaTeXRenderer')

//require('dotenv').config()

const githubApp = GitHubApp({ id: process.env.GITHUB_APP_ID, cert: process.env.GITHUB_APP_PRIVATE_KEY || fs.readFileSync(__dirname + '/../cert/private-key.pem') });
const githubWebhook = GitHubWebhook({ path: '/', secret: process.env.GITHUB_WEBHOOK_SECRET })

let server = http.createServer((req, res) => {
    githubWebhook(req, res, err => {
        res.statusCode = 404
        res.end('no such location')
    })
})

githubWebhook.on('error', err => {
    console.error('Error:', err.message)
})

githubWebhook.on('push', event => {
    console.log('Received a push event for %s to %s', event.payload.repository.name, event.payload.ref)

    githubApp
        .asInstallation(event.payload.installation.id)
        .then(github => {
            let renderer = new GitHubMarkdownLaTexRenderer(github, event.payload.repository)

            renderer
                .renderAllTexFilesOnTree(event.payload.head_commit.tree_id)
                .catch(err => console.log(err))
        })
})

server.listen(3000)