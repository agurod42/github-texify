const exec = require('child_process').exec
const fs = require('fs')
const mkdirp = require('mkdirp')
const path = require('path')
const readdirr = require('fs-readdir-recursive')
const rmdir = require('rmdir')
const urljoin = require('url-join')

TeXify = function (github, push) {
    this.github = github
    this.push = push
    
    this.tmpPath = '/tmp'
    this.treeLocalPath = path.join(this.tmpPath, this.push.head_commit.tree_id)

    if (!fs.existsSync(this.tmpPath)) {
        fs.mkdirSync(this.tmpPath)
    }

    if (!fs.existsSync(this.treeLocalPath)) {
        fs.mkdirSync(this.treeLocalPath)
    }
    else {
        rmdir(this.treeLocalPath)
    }
}

TeXify.prototype.args = function (obj) {
    return Object.assign(
        {
            owner: this.push.repository.owner.name,
            repo: this.push.repository.name
        },
        obj
    )
}

TeXify.prototype.fetchTexFilesOnPush = function () {
    return new Promise((resolve, reject) => {

        let commitFiles = []
        
        for (let commit in this.push.commits) {
            commitFiles.push(...commit.added, ...commit.modified)
        }

        this.github.gitdata
            .getTree(this.args({ sha: this.push.head_commit.tree_id, recursive: true }))
            .then(res => {
                let texFiles = []

                if (!res.data.truncated) {
                    res.data.tree.forEach(file => {
                        if (commitFiles.indexOf(file.path) >= 0 && /\.tex\.md$/gi.test(file.path)) {
                            texFiles.push(file)
                        }
                    })
                }
                
                if (!texFiles.length) {
                    console.log('No tex files found. Nothing to do')
                }

                resolve(texFiles)
            })
            .catch(reject)

    })
}

TeXify.prototype.renderAllTexFilesOnPush = function () {
    return new Promise((resolve, reject) => {
        
        this.fetchTexFilesOnPush()
            .then(texFiles => {
                Promise
                    .all(texFiles.map(file => this.renderTexFile(file)))
                    .then(resolve)
                    .catch(reject)
            })
            .catch(reject)

    })
}

TeXify.prototype.renderTexFile = function (file) {
    return new Promise((resolve, reject) => {

        this.github.gitdata
            .getBlob(this.args({ sha: file.sha }))
            .then(res => {

                try {

                    let svgOutputPath = path.join(this.treeLocalPath, path.dirname(file.path), 'tex')
                    let tmpInputPath = path.join(this.treeLocalPath, file.path)
                    let tmpOutputPath = path.join(this.treeLocalPath, file.path.replace('.tex.md', '.md'))

                    if (!fs.existsSync(svgOutputPath)) mkdirp.sync(svgOutputPath)
                    if (!fs.existsSync(tmpInputPath)) mkdirp.sync(path.dirname(tmpInputPath))
                    if (!fs.existsSync(tmpOutputPath)) mkdirp.sync(path.dirname(tmpOutputPath))

                    fs.writeFileSync(tmpInputPath, res.data.content, res.data.encoding)

                    let readme2tex = `python -m readme2tex --nocdn --output ${tmpOutputPath} --project ${this.push.repository.name} --svgdir ${svgOutputPath} --username ${this.push.repository.owner.name} ${tmpInputPath}`
                    
                    exec(readme2tex, { cwd: path.dirname(tmpInputPath) }, (err, stdout, stderr) => {
                        if (err) return reject(err)
                        
                        if (!fs.existsSync(tmpOutputPath)) {
                            return reject(new Error('readme2tex error: ' + stderr))
                        }

                        console.log(stderr)
                        console.log(stdout)

                        try {
                            let tmpOutputContents = fs.readFileSync(tmpOutputPath, 'utf8')
                                .replace(new RegExp(this.treeLocalPath, 'g'), '')
                                .replace(new RegExp('invert_in_darkmode', 'g'), 'invert_in_darkmode&sanitize=true')

                            fs.writeFileSync(tmpOutputPath, tmpOutputContents)
                        }
                        catch (ex) {
                            reject(ex)
                        }

                        resolve(file.path)
                    })

                }
                catch (ex) {
                    reject(ex)
                }
                
            })
            .catch(reject)

    })
}

TeXify.prototype.pushChangesToGitHub = function () {
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
                    message: 'Rendered TeX expressions in ' + this.push.head_commit.id,
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

module.exports = TeXify