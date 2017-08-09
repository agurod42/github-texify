const fs = require('fs')
const http = require('http')
const GitHubApp = require('github-app')
const GitHubWebhook = require('github-webhook-handler')
const TeXify = require('./texify')

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

    if (event.payload.head_commit.author.name == 'texify[bot]') {
        console.log('Push event was triggered by texify[bot]. Nothing to do.')
    }
    else {
        githubApp
            .asInstallation(event.payload.installation.id)
            .then(github => {
                let texify = new TeXify(github, event.payload)

                texify
                    .renderAllTexFilesOnPush()
                    .then(renderedFiles => {
                        if (renderedFiles.length > 0) {
                            console.log('rendered', renderedFiles)
                            return texify.pushChangesToGitHub()
                        }
                    })
                    .then(() => {
                        console.log('OK!')
                    })
                    .catch(err => console.log(err))
            })
    }
})

server.listen(process.env.PORT || 3000)