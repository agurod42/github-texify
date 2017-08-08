const exec = require('child_process').exec
const fs = require('fs')
const path = require('path')
const readdirr = require('fs-readdir-recursive')
const rmdir = require('rmdir')
const urljoin = require('url-join')

GitHubMarkdownLaTexRenderer = function (github, push) {
    this.github = github
    this.push = push
    
    this.tmpPath = path.join(__dirname, '../tmp')
    this.treeLocalPath = path.join(this.tmpPath, this.push.head_commit.tree_id)

    if (!fs.existsSync(this.tmpPath)) {
        fs.mkdirSync(this.tmpPath)
    }

    if (!fs.existsSync(this.treeLocalPath)) {
        fs.mkdirSync(this.treeLocalPath)
    }
}

GitHubMarkdownLaTexRenderer.prototype.args = function (obj) {
    return Object.assign(
        {
            owner: this.push.repository.owner.name,
            repo: this.push.repository.name
        },
        obj
    )
}

GitHubMarkdownLaTexRenderer.prototype.fetchTexFilesOnTree = function () {
    return new Promise((resolve, reject) => {

        this.github.gitdata
            .getTree(this.args({ sha: this.push.head_commit.tree_id }))
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

GitHubMarkdownLaTexRenderer.prototype.renderAllTexFilesOnTree = function () {
    return new Promise((resolve, reject) => {
        
        this.fetchTexFilesOnTree()
            .then(texFiles => {
                Promise
                    .all(texFiles.map(file => this.renderTexFile(file).catch(err => err)))
                    .then(resolve)
                    .catch(reject)
            })
            .catch(reject)

    })
}

GitHubMarkdownLaTexRenderer.prototype.renderTexFile = function (file) {
    return new Promise((resolve, reject) => {

        this.github.gitdata
            .getBlob(this.args({ sha: file.sha }))
            .then(res => {
                let tmpInputPath = path.join(this.treeLocalPath, path.basename(file.path))
                let tmpOutputPath = path.join(this.treeLocalPath, path.basename(file.path).replace('.tex.md', '.md'))

                fs.writeFileSync(tmpInputPath, res.data.content, res.data.encoding)
                
                exec('python -m readme2tex --nocdn --output ' + tmpOutputPath + ' --project ' + this.push.repository.name + ' --svgdir ' + path.join(this.treeLocalPath, 'tex') + ' --username ' + this.push.repository.owner.name + ' ' + tmpInputPath, { cwd: this.treeLocalPath }, (err, stdout, stderr) => {
                    if (err || stderr) reject(err || stderr)

                    console.log(stderr)
                    console.log(stdout)
                    
                    try {
                        let svgBaseUrl = urljoin(this.push.repository.html_url, '/master/', path.dirname(file.path)).replace('github.com', 'rawgit.com')
                        fs.writeFileSync(tmpOutputPath, fs.readFileSync(tmpOutputPath, 'utf8').replace(new RegExp(this.treeLocalPath, 'g'), svgBaseUrl))
                    }
                    catch (ex) {
                        reject(ex)
                    }

                    resolve();
                })    
            })
            .catch(reject)

    })
}

GitHubMarkdownLaTexRenderer.prototype.pushChangesToGitHub = function () {
    let files = readdirr(this.treeLocalPath)

    let createBlobPromises = files.map(file => {
        let filePath = path.join(this.treeLocalPath, file)
        let fileContents = fs.readFileSync(filePath)
        return this.github.gitdata.createBlob(this.args({ 
            content: new Buffer(fileContents).toString('base64'), 
            encoding: 'base64'
        }))
    })
    
    return Promise
            .all(createBlobPromises)
            .then(blobs => {
                return this.github.gitdata.createTree(this.args({
                    base_tree: this.push.head_commit.tree_id,
                    tree: files.map((file, index) => {
                        return {
                            type: 'blob',
                            sha: blobs[index].data.sha,
                            path: file,
                            mode: '100644',
                        }
                    })
                }))
            })
            .then(tree => {
                return this.github.gitdata.createCommit(this.args({
                    message: 'Rendered TeX expressions',
                    parents: [ this.push.head_commit.id ],
                    tree: tree.data.sha,
                }))
            })
            .then(commit => {
                return this.github.gitdata.updateReference(this.args({
                    ref: this.push.ref.replace('refs/', ''),
                    sha: commit.data.sha
                }))
            })
            .then(() => {
                rmdir(this.treeLocalPath)
            })
}

module.exports = GitHubMarkdownLaTexRenderer