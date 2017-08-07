const exec = require('child_process').exec
const fs = require('fs')
const path = require('path')

GitHubMarkdownLaTexRenderer = function (github, repo) {
    this.github = github
    this.repo = repo
    this.tmpPath = path.join(__dirname, '../tmp')

    if (!fs.existsSync(this.tmpPath)) {
        fs.mkdirSync(this.tmpPath)
    }
}

GitHubMarkdownLaTexRenderer.prototype.args = function (obj) {
    return Object.assign(
        {
            owner: this.repo.owner.name,
            repo: this.repo.name
        },
        obj
    )
}

GitHubMarkdownLaTexRenderer.prototype.fetchTexFilesOnTree = function (treeId, action) {
    return new Promise((resolve, reject) => {

        this.github.gitdata
            .getTree(this.args({ sha: treeId }))
            .then(res => {
                let texFiles = []

                if (!res.data.truncated) {
                    res.data.tree.forEach(file => {
                        if (/\.tex\.md$/gi.test(file.path)) {
                            texFiles.push(file)
                        }
                    })
                }
                
                resolve(texFiles)
            })
            .catch(reject)

    })
}

GitHubMarkdownLaTexRenderer.prototype.renderAllTexFilesOnTree = function (treeId) {
    return new Promise((resolve, reject) => {

        this.fetchTexFilesOnTree(treeId)
            .then(texFiles => {
                let renderTexFilePromises = []

                texFiles.forEach(file => {
                    let renderTexFilePromise = this.renderTexFile(treeId, file)
                    renderTexFilePromises.push(renderTexFilePromise)
                })

                Promise
                    .all(renderTexFilePromises.map(p => p.catch(err => err)))
                    .then(values => {
                        console.log(values)
                        resolve(renderTexFilePromises.length)
                    })
            })

    })
}

GitHubMarkdownLaTexRenderer.prototype.renderTexFile = function (treeId, file) {
    return new Promise((resolve, reject) => {

        // reject if the file was commited by this bot
        // TODO: Find a better way to do it
        this.github.repos
            .getCommits(this.args({ path: file.path }))
            .then(res => {
                if (res.data[0].commit.committer.name == 'GitHub') {
                    reject('This file was commited by GitHub so we should not render it')
                }
            })
            .then(() => {

                this.github.gitdata
                    .getBlob(this.args({ sha: file.sha }))
                    .then(res => {
                        // render tex.md file
                        let tmpInputPath = path.join(this.tmpPath, res.data.sha) + '.tex.md'
                        let tmpOutputPath = path.join(this.tmpPath, res.data.sha) + '.md'

                        fs.writeFileSync(tmpInputPath, res.data.content, res.data.encoding)

                        exec('python -m readme2tex --nocdn --output ' + tmpOutputPath + ' --project ' + this.repo.name + ' --username ' + this.repo.owner.name + ' ' + tmpInputPath, (err, stdout, stderr) => {
                            if (err) reject(err)

                            console.log(stdout)
                        })

                        return tmpOutputPath          
                    })
                    .then(renderedFileLocalPath => {
                        // push rendered .md file
                        let commitMessage = 'Rendered TeX expressions on ' + file.path
                        let renderedFileContents = fs.readFileSync(renderedFileLocalPath)
                        let renderedFileContentsBase64 = new Buffer(renderedFileContents).toString('base64')
                        let renderedFileRemotePath = file.path.replace('.tex.md', '.md')

                        this.github.repos
                            .getContent(this.args({ path: renderedFileRemotePath }))
                            .then(res => {
                                this.github.repos.updateFile(
                                    this.args({
                                        sha: res.data.sha,
                                        path: renderedFileRemotePath,
                                        content: renderedFileContentsBase64,
                                        message: commitMessage
                                    }),
                                    res => {
                                        resolve(renderedFileRemotePath)
                                    }
                                )
                            })
                            .catch(err => {
                                if (err.code == 404) {
                                    this.github.repos.createFile(
                                        this.args({
                                            path: renderedFileRemotePath,
                                            content: renderedFileContentsBase64,
                                            message: commitMessage
                                        }),
                                        res => {
                                            resolve(renderedFileRemotePath)
                                        }
                                    )
                                }
                                else {
                                    reject(err)
                                }
                            })
                    })
            })
    })
}

module.exports = GitHubMarkdownLaTexRenderer