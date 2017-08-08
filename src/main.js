const fs = require('fs')
const http = require('http')
const GitHubApp = require('github-app')
const GitHubWebhook = require('github-webhook-handler')

const GitHubMarkdownLaTexRenderer = require('./githubMarkdownLaTeXRenderer')

if (process.env.NODE_ENV != 'production') {
    require('dotenv').config()
}

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

    if (event.payload.head_commit.author.name == 'markdown-latex-renderer[bot]') {
        console.log('Push event was triggered by markdown-latex-renderer[bot]. Nothing to do.')
    }
    else {
        githubApp
            .asInstallation(event.payload.installation.id)
            .then(github => {
                let renderer = new GitHubMarkdownLaTexRenderer(github, event.payload)

                renderer
                    .renderAllTexFilesOnTree()
                    .then(() => renderer.pushChangesToGitHub())
                    .then(() => {
                        console.log('OK!')
                    })
                    .catch(err => console.log(err))
            })
    }
})

server.listen(process.env.PORT || 3000)